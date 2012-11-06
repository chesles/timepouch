#!/usr/bin/env node

var path = require('path')
  , util = require('util')

var pouch = require('pouchdb')
  , moment = require('moment')

var options = require('optimist')
  .alias('d', 'display')
  .alias('s', 'sheet')
  .alias('l', 'list')
  .alias('e', 'edit')
  .alias('i', 'in')
  .alias('o', 'out')
  .alias('h', 'help')
  .boolean(['i', 'o'])

options.describe('d', 'Display checkins for the current sheet');
options.describe('s', 'Select or create a sheet');
options.describe('l', 'Display timesheets');
options.describe('i', 'Check in to the current timesheet');
options.describe('o', 'Check out of the current timesheet');

var argv = options.argv;

var dir = path.join(process.env.HOME, '.timepouch');
var out = process.stdout;

var meta_key = '_meta';

if (argv.help) {
  options.showHelp();
  process.exit();
}

pouch('ldb://'+dir, function(err, db) {
  if (err) {
    return console.error(err);
  }


  // display current sheet
  if (argv.display) {
    db.get(meta_key, function(err, meta) {
      if (!meta) {
        return console.error('No timesheets or checkins yet!');
      }

      db.allDocs({include_docs: true}, function(err, docs) {
        var format = "%s\t%s\t%s\t%s\t%s\n";
        var header = util.format(format, "   Date\t", "Start", "End", "Duration", "Notes");

        out.write(header);

        docs.rows.forEach(function(row) {
          if (row.id == meta_key) return;
          if (row.doc.sheet != meta.current_sheet) return;

          var start = moment(row.doc.start);
          var incomplete = false, end, duration;

          if (!row.doc.end) {
            end = moment(new Date());
            incomplete = true;
          }
          else {
            end = moment(row.doc.end);
          }
          duration = moment.duration(start.diff(end, 'minutes'), 'minutes');

          var line = util.format(format,
                                 start.format('DD/MM/YYYY'),
                                 start.format('HH:mm'),
                                 incomplete ? '-' : end.format('HH:mm'),
                                 duration.humanize(),
                                 row.doc.note || '');
          out.write(line);
        });
      });
    });
  }

  // create/select a sheet
  else if (argv.sheet) {
    db.get(meta_key, function(err, meta) {
      if (err && err.status != 404) return console.error(err);
      if (!meta) {
        meta = {
          _id: meta_key,
          sheets: []
        };
      }
      if (meta.sheets.indexOf(argv.sheet) < 0) {
        meta.sheets.push(argv.sheet);
      }
      if (!meta.current_sheet || meta.current_sheet != argv.sheet) {
        out.write('> selected sheet ' + argv.sheet + '\n');
        meta.current_sheet = argv.sheet;
      }
      else {
        out.write('> already in sheet ' + argv.sheet + '\n');
      }
      db.put(meta);
    });
  }

  // list sheets
  else if (argv.list) {
    db.get(meta_key, function(err, meta) {
      if (meta && Array.isArray(meta.sheets)) {
        console.log(meta.sheets);
        meta.sheets.forEach(function(sheet) {
          if (sheet == meta.current_sheet) {
            sheet = '*' + sheet;
          }
          out.write(" > " + sheet + "\n");
        });
      }
      else
        console.log('No sheets found');
    });
  }

  // check in to current sheet
  else if (argv.in) {
    db.get(meta_key, function(err, meta) {
      if (err && err.status !== 404) return console.error(err);
      if (!meta) {
        meta = {_id: meta_key};
      }
      if (!meta.current_sheet) {
        return console.error("No timesheet selected!");
      }
      if (meta.now && meta.now[meta.current_sheet]) {
        return console.error('Already checked into "%s"', meta.current_sheet);
      }
      if (!meta.next_id) {
        meta.next_id = 1;
      }

      var start = new Date();
      var end = null;

      // create the db record
      var time = {
        _id: ''+meta.next_id++,
        start: start,
        end: end,
        sheet: meta.current_sheet,
        note: argv._.join(' '),
        timestamp: new Date()
      }

      // record this checkin in metadata
      var now = meta.now || {};
      now[meta.current_sheet] = time._id;
      meta.now = now;

      db.bulkDocs({docs: [meta, time]});
      out.write('Checked into sheet "'+meta.current_sheet+'"\n');
    });
  }

  // check out of current sheet/task
  else if (argv.out) {
    db.get(meta_key, function(err, meta) {
      if (!meta) {
        return console.error('No timesheet selected!');
      }
      if (!meta.current_sheet) {
        return console.error('Not checked in to a sheet');
      }
      if (!meta.now || meta.now[meta.current_sheet] == undefined) {
        console.log(meta);
        return console.error('Not checked in to the current sheet ("%s")', meta.current_sheet);
      }
      var id = meta.now[meta.current_sheet];
      db.get(id, function(err, time) {
        if (err) {
          return console.error(err);
        }
        time.end = new Date();
        time.timestamp = new Date();
        delete meta.now[meta.current_sheet];
        db.bulkDocs({docs: [meta, time]});
      });
    });
  }
  else if (argv.sync) {
    // TODO: sync!
  }
});
