var timepouch = require('./timepouch')

module.exports = {
  setUp: function(done) {
    console.log('>>> setup')
    this.timepouch = timepouch('test', done);
    this.pouch = this.timepouch.db;
  },

  tearDown: function(done) {
    console.log('<<< teardown, deleting pouch...')
    this.timepouch.destroy(function() {
      done();
    });
  },

  'timepouch.sheet': function(test) {
    var timepouch = this.timepouch;
    var sheet1 = 'test-sheet';
    var sheet2 = 'test-sheet2';

    timepouch.sheet(sheet1, function(err, selected) {
      test.strictEqual(err, null);
      test.strictEqual(selected, true);
      test.equal(timepouch.metadata.current_sheet, sheet1)
      test.equal(timepouch.metadata.sheets[0], sheet1)
      test.equal(timepouch.metadata.sheets.length, 1)

      timepouch.sheet(sheet2, function(err, selected) {
        test.strictEqual(err, null);
        test.strictEqual(selected, true);
        test.equal(timepouch.metadata.current_sheet, sheet2)
        test.equal(timepouch.metadata.sheets[1], sheet2)
        test.equal(timepouch.metadata.sheets.length, 2)

        timepouch.sheet(sheet1, function(err, selected) {
          test.strictEqual(err, null);
          test.strictEqual(selected, true);
          test.equal(timepouch.metadata.current_sheet, sheet1)
          test.equal(timepouch.metadata.sheets.length, 2)
          test.done();
        })
      })
    })
  },

  'timepouch.rmsheet': function(test) {
    var timepouch = this.timepouch;
    var sheet = 'test-sheet';
    timepouch.rmsheet(sheet, function(err, result) {
      test.notEqual(err, null);
      test.ok(/does not exist/.test(err.reason))

      timepouch.sheet(sheet, function(err, selected) {
        test.strictEqual(err, null);
        test.ok(selected);
        test.equal(timepouch.metadata.sheets.length, 1);

        // TODO: test rmsheet with 'entries' = true
        timepouch.rmsheet(sheet, function(err) {
          test.equal(timepouch.metadata.sheets.length, 0);
          test.done();
        });
      });
    });
  },

  'timepouch.sheets': {
    'empty': function(test) {
      var timepouch = this.timepouch;
      timepouch.sheets(function(err, sheets, cur, checkedin) {
        test.strictEqual(err, null);
        test.equal(sheets.length, 0)
        test.equal(cur, null)
        test.equal(checkedin.length, 0)
        test.done();
      })
    },
    'non-empty': function(test) {
      var timepouch = this.timepouch;
      var sheets = ['one', 'two'];
      var count = 0;
      sheets.forEach(function(sheet) { timepouch.sheet(sheet, added); });

      function added(err, selected) {
        test.strictEqual(err, null);
        test.strictEqual(selected, true);

        if (++count == sheets.length) {
          next();
        }
      }
      function next() {
        timepouch.sheets(function(err, s, c, a) {
          test.strictEqual(err, null);
          test.equal(s.length, sheets.length)
          test.equal(c, sheets[sheets.length - 1])
          test.equal(a.length, 0)
          test.done();
        })
      }
    }
  },

  'timepouch.in': {
    'check-in - no sheet': function(test) {
      var timepouch = this.timepouch;
      var entry = {}
      timepouch.in(entry, function(err, e) {
        test.notEqual(err, null);
        test.ok(/no sheet/.test(err.reason));
        test.done();
      })
    },
    'check-in - normal': function(test) {
      var timepouch = this.timepouch;
      // TODO: make checkin-in tests more comprehensive
      var entry = {
        sheet: 'test-sheet',
        note: 'test entry',
        start: 'Jan 1, 2012 8:00',
        end: 'Jan 1, 2012 17:00'
      }
      timepouch.in(entry, function(err, e) {
        test.strictEqual(err, null);
        test.equal(e.sheet, entry.sheet)
        test.equal(e.note, entry.note)

        test.equal(e.start.valueOf(), new Date(entry.start).valueOf())
        test.equal(e.end.valueOf(), new Date(entry.end).valueOf())

        test.notEqual(e._id, undefined);
        test.done();
      })
    },
    'check-out': function(test) {
      test.done();
    }
  }
}
