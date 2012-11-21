var Duration = require('duration')
  , Table = require('easy-table')
  , dateformat = require('dateformat')

module.exports = {
  text: text,
  csv: csv,
  tsv: tsv,
}

/*
 * text: text formatter
 *
 * options:
 *  - out: a writable stream to write output to
 * entries: an array of entries to process
 */
function text(options, entries) {
  var table = new Table();

  var out = options.out;
  var dateFormat = options.dateFormat || 'isoDate'
    , timeFormat = options.timeFormat || 'isoTime'
    , durationFormat = options.durationFormat || '%Hs:%M:%S'

  var totalms = 0;
  var lastdate = null;
  entries.forEach(function(entry) {
    var start = new Date(entry.start);
    var incomplete = false, end, duration;

    if (!entry.end) {
      end = new Date();
      incomplete = true;
    }
    else {
      end = new Date(entry.end);
    }
    var length = new Duration(start, end);
    totalms += length.milliseconds;

    // group entries by date - don't display if same as the last date displayed
    var start_date = dateformat(start, dateFormat);
    var end_date = dateformat(end, dateFormat);
    if (start_date == lastdate) {
      start_date = '';
    }
    else {
      lastdate = start_date;
    }
    table.cell('Date', start_date);
    table.cell('Start', dateformat(start, timeFormat));
    if (end_date !== lastdate) {
      table.cell('End Date', end_date);
    }
    table.cell('End', incomplete ? '-' : dateformat(end, timeFormat));
    table.cell('Duration', length.toString(durationFormat));
    table.cell('Note', entry.note || '');
    if (options.verbose) {
      table.cell("Id", entry._id);
    }
    table.newRow();
  });
  out.write(table.toString());
  out.write('Total: ' + new Duration(new Date(0), new Date(totalms)).toString(durationFormat) + "\n");
}

function csv(options, entries) {
  var out = options.out;

  var delimiter = options.delimiter;
  if (delimiter === undefined) {
    delimiter = ",";
  }

  var header = ['start', 'end', 'note', 'sheet']
    , line
  if (options.verbose) {
    header.push('id');
  }
  out.write(header.join(delimiter));
  entries.forEach(function(entry) {
    var start = entry.start
      ? dateformat(entry.start, 'isoDate') + ' '
        + dateformat(entry.start, 'isoTime')
      : '';
    var end = entry.end
      ? dateformat(entry.end, 'isoDate') + ' '
        + dateformat(entry.end, 'isoTime')
      : '',
    line = [start, end, entry.note || '', entry.sheet];
    if (options.verbose) {
      line.push(entry._id);
    }
    out.write(line.join(delimiter));
    out.write("\n");
  });
}

function tsv(options, entries) {
  options.delimiter = "\t";
  return csv(options, entries);
}
