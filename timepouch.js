if (typeof module !== 'undefined' && module.exports) {
  var Pouch = require('pouchdb');
  module.exports = Timepouch;
}

function Timepouch(name, callback) {
  if (this === global) return new Timepouch(name);

  var timepouch = this;
  timepouch._init = false;
  timepouch.Q = [];
  timepouch.db = Pouch(name, function(err, db) {
    if (err) return callback(err);
    timepouch._init = true;
    timepouch._doQ();
  });
}

Timepouch.meta_key = 'metadata';
Timepouch.noop = function(err) { if (err) console.error(err); };

/*
 * calls are queued up until the db is initialized, then they are executed in
 * order
 */
Timepouch.prototype._doQ = function() {
  while (this.Q.length > 0) {
    var task = this.Q.shift();
    this[task.task].apply(this, task.args);
  };
}

/*
 * sheet: create or select sheet as the current timesheet
 *
 * callback(err, status) is called when the operation is complete; status will
 * be true if the sheet was selected, or false if it was already selected
 */
Timepouch.prototype.sheet = function(sheet, callback) {
  if (!this._init) return this.Q.push({task: 'sheet', args: arguments});

  if (!callback) callback = Timepouch.noop;
  var db = this.db;
  db.get(Timepouch.meta_key, function(err, meta) {
    if (err && err.status != 404) return callback(err);
    if (!meta) {
      meta = {
        _id: meta_key,
        sheets: [],
        now: {}
      };
    }
    if (meta.sheets.indexOf(sheet) < 0) {
      meta.sheets.push(sheet);
    }

    var selected = true;
    if (!meta.current_sheet || meta.current_sheet != sheet) {
      meta.current_sheet = sheet;
    }
    else {
      selected = false;
    }
    db.put(meta, function(err, result) {
      if (err) callback(err);
      else callback(null, selected);
    })
  });
}

/*
 * rmsheet: remove a sheet (and optionally all entries in that sheet)
 *
 * sheet: the name of the sheet to delete (pass boolean true to delete current sheet)
 * entries: if true, remove all entries for the specified sheet (default: false)
 * callback: a function that takes (err, response) response looks like {ok: true, sheet: deletedsheet}
 */
Timepouch.prototype.rmsheet = function(sheet, entries, callback) {
  if (!this._init) return this.Q.push({task: 'rmsheet', args: arguments});

  if (entries === undefined || entries instanceof Function) {
    callback = entries || Timepouch.noop;
    entries = null;
  }
  var timepouch = this;
  timepouch.db.get(Timepouch.meta_key, function(err, meta) {
    if (err && err.status !== 404) return callback(err);
    if (!meta) {
      return callback({reason: 'no timepouch metadata found'});
    }
    if (sheet === true) {
      sheet = meta.current_sheet;
    }
    if (!sheet) {
      return callback({reason: 'no sheet specified/selected'});
    }

    // remove sheet from the list of sheets
    meta.sheets = meta.sheets.filter(function(el) {
      return el !== sheet;
    });

    if (meta.current_sheet == sheet) {
      meta.current_sheet = null;
    }

    // remove entries on this sheet, if requested
    if (entries) {
      timepouch.query({sheet: sheet}, function(err, results) {
        var removed = 0;
        if (results.rows.length == 0) {
          return done();
        }
        results.rows.forEach(function(entry) {
          timepouch.db.remove(entry, function(err, response) {
            if (err) {
              console.error(err);
            }
            removed++;
            if (removed == results.rows.length) {
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
      return timepouch.db.put(meta, function(err, response) {
        if (err) return callback(err);
        callback(err, {ok: response.ok, sheet: sheet});
      });
    }
  });
}

/*
 * sheets: get a list of timesheets
 *
 * callback should have signature (err, sheets, current_sheet, active_sheets)
 */
Timepouch.prototype.sheets = function(callback) {
  if (!this._init) return this.Q.push({task: 'sheets', args: arguments});
  if (!callback) callback = Timepouch.noop;

  this.db.get(Timepouch.meta_key, function(err, meta) {
    if (err) return callback(err);
    return callback(err, meta.sheets || [], meta.current_sheet, Object.keys(meta.now));
  });
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
  if (!this._init) return this.Q.push({task: 'in', args: arguments});

  if (!callback) callback = Timepouch.noop;
  var db = this.db;
  db.get(Timepouch.meta_key, function(err, meta) {
    if (err && err.status !== 404) return callback(err);
    if (!meta) {
      return callback({error: 'no_metadata', reason: 'no metadata found'});
    }
    if (!meta.current_sheet && !options.sheet) {
      return callback({error: 'no_sheet_selected', reason: 'no sheet selected'});
    }

    if (meta.now && meta.now[meta.current_sheet] && !options.id) {
      return callback({error: 'already_checked_in', reason: 'already checked in'});
    }

    if (options.id) {
      db.get(options.id, upsert);
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

      // if we are moving an entry to another sheet, we have to make sure to
      // update the now object in the metadata
      var prevsheet = time.sheet;
      time.sheet = options.sheet || time.sheet || meta.current_sheet || '';
      if (options.id && prevsheet && time.sheet !== prevsheet) {
        if (meta.now[prevsheet] === options.id) {
          delete meta.now[prevsheet];
        }
      }

      time.timestamp = new Date();
      time.type = 'timepouch';

      if (meta.sheets.indexOf(time.sheet) < 0) {
        meta.sheets.push(time.sheet);
      }

      db.put(time, function(err, info) {
        if (err) return callback(err);

        // update current checked-in activity on this sheet
        if (!meta.now) meta.now = {}

        if (time.end && meta.now[time.sheet])
          delete meta.now[time.sheet];
        else if (!time.end)
          meta.now[time.sheet] = info.id;

        db.put(meta, function(err, info) {
          return callback(err, time);
        });
      });
    }
  });
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
  if (!this._init) return this.Q.push({task: 'out', args: arguments});

  if (!callback) callback = Timepouch.noop;
  var db = this.db
    , timepouch = this

  db.get(Timepouch.meta_key, function(err, meta) {
    if (err && err.status !== 404) return callback(err);
    if (!meta) {
      return callback({error: 'no_metadata', reason: 'no metadata found'});
    }
    var sheet = options.sheet || meta.current_sheet;
    if (meta.now && !meta.now[sheet] && !options.id) {
      return callback({error: 'not_checked_in', reason: 'not checked in'});
    }
    options.end = options.end || new Date();
    options.id = options.id || meta.now[sheet];

    timepouch.edit(options, callback);
  });
}

/*
 * sync: push local changes to CouchDB at url, then pull remote changes down
 *
 * - url: the couchdb url to sync with
 * - callback: a function taking (err, local->remote results, local<-remote results)
 */
Timepouch.prototype.sync = function(url, callback) {
  if (!this._init) return this.Q.push({task: 'sync', args: arguments});

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
  if (!this._init) return this.Q.push({task: 'query', args: arguments});

  if (options.before && !(options.before instanceof Date))
    options.before = new Date(options.before);
  if (options.after && !(options.after instanceof Date))
    options.after = new Date(options.after);
  if (!options.sort)
    options.sort = 'start';

  var map = function(doc) {
    if (doc.type != 'timepouch') return;
    emit(doc._id, doc);
  }
  this.db.query({map: map}, {reduce: false}, filter);

  function filter(err, results) {
    var filtered = [];
    results.rows.forEach(function(row) {
      var belongs = true;
      var doc = row.value;

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
