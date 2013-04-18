var Pouch = require('pouchdb')
  , patch = require('patch')

module.exports = Timepouch;

function Timepouch(name, callback) {
  if (!(this instanceof Timepouch)) {
    return new Timepouch(name, callback);
  }

  var timepouch = this;
  var steps = 2;

  this.name = name;
  this.db = Pouch(name, function(err, db) {
    if (err) {
      timepouch.db = null;
      return callback(err);
    }
    done();
  });
  getmetadata(this.db, function(err, meta) {
    if (!meta) {
      meta = patch({deep:true}, {}, Timepouch.blank_metadata);
    }
    timepouch.metadata = meta;
    done();
  });

  function done() {
    if (--steps == 0) return callback(null, timepouch);
  }
}

Timepouch.blank_metadata = {
  type: 'timepouch-metadata',
  sheets: [],
  now: {}
};
Timepouch.noop = function(err) { if (err) console.error(err); };

/*
 * find the metadata document, if one exists
 */
function getmetadata(db, callback) {
  if (!callback) callback = Timepouch.noop;

  function map(doc) {
    if (doc.type === 'timepouch-metadata' || doc._id == 'metadata') {
      emit(doc.type, null)
    }
  }
  var opts = {
    reduce: false,
    include_docs: true
  }

  db.query({map: map}, opts, function(err, results) {
    if (err || !results || results.rows.length < 1) {
      return callback(new Error('no metadata found'));
    }
    else if (results.rows && results.rows.length > 1) {
      return callback(new Error('multiple metadatas found'));
    }
    var metadata = null;
    if (results.rows && results.rows.length > 0) {
      metadata = results.rows[0].doc;
    }
    callback(err, metadata)
  });
}

function savemetadata(obj, db, callback) {
  if (!callback) callback = Timepouch.noop;

  function updateObj(err, res) {
    if (err) return callback(err);
    else if (res && res.ok) {
      obj._id = res.id;
      obj._rev = res.rev;
      return callback(null);
    }
  }
  if (!obj._id) {
    db.post(obj, updateObj);
  }
  else {
    db.put(obj, updateObj);
  }
}

/*
 * sheet: create or select sheet as the current timesheet
 *
 * callback(err, status) is called when the operation is complete; status will
 * be true if the sheet was selected, or false if it was already selected
 */
Timepouch.prototype.sheet = function(sheet, callback) {
  if (!callback) callback = Timepouch.noop;

  if (this.metadata.sheets.indexOf(sheet) < 0) {
    this.metadata.sheets.push(sheet);
  }

  var selected = true;
  if (!this.metadata.current_sheet || this.metadata.current_sheet != sheet) {
    this.metadata.current_sheet = sheet;
  }
  else {
    selected = false;
  }

  savemetadata(this.metadata, this.db, function(err, result) {
    if (err) callback(err);
    else callback(null, selected);
  })
}

/*
 * rmsheet: remove a sheet (and optionally all entries in that sheet)
 *
 * sheet: the name of the sheet to delete (pass boolean true to delete current sheet)
 * entries: if true, remove all entries for the specified sheet (default: false)
 * callback: a function that takes (err, response) response looks like {ok: true, sheet: deletedsheet}
 */
Timepouch.prototype.rmsheet = function(sheet, entries, callback) {
  if (entries === undefined || entries instanceof Function) {
    callback = entries || Timepouch.noop;
    entries = false;
  }

  if (sheet === true) {
    sheet = this.metadata.current_sheet;
  }

  // remove sheet from the list of sheets
  var i = this.metadata.sheets.indexOf(sheet);
  if (!sheet) {
    return callback({reason: 'no sheet specified/selected'});
  }
  else if (i < 0) {
    return callback({reason: 'specified sheet does not exist'});
  }
  else {
    this.metadata.sheets.splice(i, 1);
  }

  if (this.metadata.current_sheet == sheet) {
    this.metadata.current_sheet = null;
  }

  var timepouch = this;
  // remove entries on this sheet, if requested
  if (entries) {
    this.query({sheet: sheet}, function(err, results) {
      var removed = 0;
      if (results.rows.length == 0) {
        return done();
      }
      results.rows.forEach(function(entry) {
        timepouch.db.remove(entry, function(err, response) {
          if (err) {
            console.error(err);
          }
          if (++removed == results.rows.length) {
            done();
          }
        });
      });
    });
  }
  else {
    return done();
  }
  function done() {
    savemetadata(timepouch.metadata, timepouch.db, callback)
  }
}

/*
 * sheets: get a list of timesheets
 *
 * callback should have signature (err, sheets, current_sheet, active_sheets)
 */
Timepouch.prototype.sheets = function(callback) {
  if (!callback) callback = Timepouch.noop;

  var meta = this.metadata;

  return process.nextTick(function() {
    callback(null, meta.sheets || [],
      meta.current_sheet || null,
      Object.keys(meta.now));
  })
}

/*
 * in (or edit): check in to a timesheet
 *
 * options:
 *  - start: a date, or string parsable by new Date(str)
 *  - end: a date, or string parsable by new Date(str)
 *  - note: a note to attach to this entry
 *  - sheet: the sheet this entry belongs in (defaults to current)
 *  - id: an id to update/edit
 */
Timepouch.prototype.in = Timepouch.prototype.edit = function(options, callback) {
  if (!callback) callback = Timepouch.noop;

  var timepouch = this;

  if (!timepouch.metadata.current_sheet && !options.sheet) {
    return callback({error: 'no_sheet_selected', reason: 'no sheet selected'});
  }

  if (timepouch.metadata.now && timepouch.metadata.now[timepouch.metadata.current_sheet] && !options.id) {
    return callback({error: 'already_checked_in', reason: 'already checked in'});
  }

  if (options.id) {
    timepouch.db.get(options.id, upsert);
  }
  else {
    upsert(null, {});
  }

  function upsert(err, time) {
    if (err) return callback(err);

    time.start = options.start
      ? new Date(options.start)
      : time.start || new Date();

    time.end = options.end
      ? new Date(options.end)
      : time.end || null;

    time.note = options.note || time.note || '';

    var prevsheet = time.sheet;
    time.sheet = options.sheet || time.sheet || timepouch.metadata.current_sheet || '';

    // update the now object in the metadata if we are moving an entry
    // to another sheet 
    if (options.id && prevsheet && time.sheet !== prevsheet) {
      if (timepouch.metadata.now[prevsheet] === options.id) {
        delete timepouch.metadata.now[prevsheet];
      }
    }

    time.timestamp = new Date();
    time.type = 'timepouch-entry';

    // create the sheet if it didn't already exist
    if (timepouch.metadata.sheets.indexOf(time.sheet) < 0) {
      timepouch.metadata.sheets.push(time.sheet);
    }

    timepouch.db.post(time, function(err, info) {
      if (err) return callback(err);

      if (!time._id) time._id = info.id
      if (!time._rev) time._rev = info.rev

      // update current checked-in activity on this sheet
      if (!timepouch.metadata.now) timepouch.metadata.now = {}
      if (time.end && timepouch.metadata.now[time.sheet]) {
        delete timepouch.metadata.now[time.sheet];
      }
      else if (!time.end) {
        timepouch.metadata.now[time.sheet] = info.id;
      }

      savemetadata(timepouch.metadata, timepouch.db, function(err, info) {
        return callback(err, time);
      });
    })
  }
}

/*
 * out: check out of a timesheet
 * 
 * options:
 *  - end: a Date or string parsable by new Date(str). (defaults to now)
 *  - id: id of record to adjust ending time of (defaults to current check-in
 *        on current sheet)
 */
Timepouch.prototype.out = function(options, callback) {
  if (!callback) callback = Timepouch.noop;

  var timepouch = this

  if (!timepouch.metadata) {
    return callback({error: 'no_metadata', reason: 'no metadata found'});
  }
  var sheet = options.sheet || timepouch.metadata.current_sheet;
  if (timepouch.metadata.now && !timepouch.metadata.now[sheet] && !options.id) {
    return callback({error: 'not_checked_in', reason: 'not checked in'});
  }
  options.end = options.end || new Date();
  options.id = options.id || timepouch.metadata.now[sheet];

  timepouch.edit(options, callback);
}

/*
 * sync: push local changes to CouchDB at url, then pull remote changes down
 *
 * - url: the couchdb url to sync with
 * - callback: a function taking (err, local->remote results, local<-remote results)
 */
Timepouch.prototype.sync = function(url, callback) {
  if (!callback) callback = Timepouch.noop;

  var timepouch = this;
  Pouch(url, function(err, remote) {
    if (err) return callback(err);

    timepouch.db.replicate.to(remote, function(err, upResults) {
      if (err) return callback(err);

      timepouch.db.replicate.from(remote, function(err, downResults) {
        if (err) return callback(err);

        return callback(err, upResults, downResults);
      });
    });
  });
}

/*
 * query: return an array of entries matching query
 *
 * options:
 *  - before: a Date or string parsable by new Date(str)
 *  - after: a Date or string parsable by new Date(str)
 *  - active: boolean- true to return only active entries
 *  - note: a string or regexp
 *  - sheet: a string or array specifying which sheet(s) to get entries from
 *  - sort: field to sort by
 */
Timepouch.prototype.query = function(options, callback) {
  if (options.before && !(options.before instanceof Date))
    options.before = new Date(options.before);
  if (options.after && !(options.after instanceof Date))
    options.after = new Date(options.after);
  if (!options.sort)
    options.sort = 'start';

  var map = function(doc) {
    if (doc.type !== 'timepouch' && doc.type !== 'timepouch-entry') return;
    emit(doc._id, null);
  }
  this.db.query({map: map}, {reduce: false, include_docs: true}, filter);

  function filter(err, results) {
    var filtered = [];
    results.rows.forEach(function(row) {
      var belongs = true;
      var doc = row.doc;

      doc.start = doc.start ? new Date(doc.start) : null;
      doc.end = doc.end ? new Date(doc.end) : null;

      // TODO: test before/after against start, or end?
      if (options.before && doc.start >= options.before)
        belongs = false;
      if (options.after && doc.start < options.after)
        belongs = false;
      if (options.active && doc.end)
        belongs = false;
      if (options.note && doc.note.indexOf(options.note) < 0)
        belongs = false;
      if (options.sheet && doc.sheet !== options.sheet)
        belongs = false;

      if (belongs)
        filtered.push(doc);
    });

    function cmp(a, b) {
      if (a[options.sort] !== b[options.sort])
        return a[options.sort] < b[options.sort] ? -1 : 1
      return 0;
    }

    filtered.sort(cmp);
    return callback(null, {rows: filtered});
  }
}

Timepouch.prototype.destroy = function(callback) {
  var name = this.name;
  this.db.close(function() {
    Pouch.destroy(name, callback);
  })
}
