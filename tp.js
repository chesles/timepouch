#!/usr/bin/env node

var path = require('path')
  , util = require('util')

var pouch = require('pouchdb')
  , moment = require('moment')
  , timepouch = require('./timepouch')

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
options.describe('sync [url]', 'Sync changes with the CouchDB server at url');

var argv = options.argv;

var dir = path.join(process.env.HOME, '.timepouch');
var out = process.stdout;

var meta_key = 'metadata';

if (argv.help) {
  options.showHelp();
  process.exit();
}

var tp = timepouch(dir);

if (argv.query) {
  tp.query(argv, console.log);
}

// create/select a sheet
else if (argv.sheet) {
  tp.sheet(argv.sheet, function(err, changed) {
    if (err) console.error(err);
    else if (changed)
      console.log("> selected sheet '%s'", argv.sheet);
    else
      console.log("> sheet '%s' already selected", argv.sheet);
  });
}

// list sheets
else if (argv.list) {
  tp.sheets(function(err, sheets, cur, active) {
    if (err) return log(err);

    sheets.forEach(function(sheet) {
      if (sheet == cur) {
        sheet = '*' + sheet;
      }
      out.write(" > " + sheet + "\n");
    });
    if (sheets.length == 0)
      console.log('No sheets found');
  });
}

// check in to current sheet
else if (argv.in) {

  // start date: at, or start, or now
  var start = argv.at
    ? new Date(argv.at)
    : argv.start
        ? new Date(argv.start)
        : new Date();

  // check in and out in one fell swoop
  var end = argv.end ? new Date(argv.end) : null;

  tp.in({
    start: start,
    end: end,
    note: argv._.join(' '),
    id: argv.id || null
  }, log);

}

// check out of current sheet/task
else if (argv.out) {

  // end: specify with --at or --end. defaults to now
  var end = argv.at
    ? new Date(argv.at)
    : argv.end
        ? new Date(argv.end)
        : new Date();

  tp.out({
    end: end,
    id: argv.id || null
  }, log);
}

// display current sheet
else if (argv.display) {
  tp.sheets(function(err, sheets, cur, active) {
    if (err) return log(err);

    var format = "%s\t%s\t%s\t%s\t%s\n";
    var header = util.format(format, "   Date\t", "Start", "End", "Duration", "Notes");

    var options = argv;
    options.sheet = options.sheet || cur;

    tp.query(options, function(err, results) {
      out.write(header);
      results.rows.forEach(function(row) {
        var start = moment(row.start);
        var incomplete = false, end, duration;

        if (!row.end) {
          end = moment(new Date());
          incomplete = true;
        }
        else {
          end = moment(row.end);
        }
        duration = moment.duration(start.diff(end, 'minutes'), 'minutes');

        var line = util.format(format,
          start.format('DD/MM/YYYY'), start.format('HH:mm'),
          incomplete ? '-' : end.format('HH:mm'), duration.humanize(), row.note || '');
        out.write(line);
      });
    });
  });
}

else if (argv.sync) {
  tp.sync(argv.sync, console.log);
}

function log(err, results) {
  if (err) console.error("Error:", err.reason);
  else if (results.start && !results.end) {
    console.log("> starting task '%s' at %s", results.note || '(no note)', results.start);
  }
  else if (results.start && results.end) {
    console.log("> checked out of '%s' at %s", results.note || '(no note)', results.end);
  }
}
