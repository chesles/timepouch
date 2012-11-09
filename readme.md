# timepouch

`timepouch` is a command-line time tracking utility made with [node.js](http://nodejs.org) and [PouchDB](http://pouchdb.com). It was inspired by [timetrap](https://github.com/samg/timetrap). `timepouch` improves on timetrap by using a database that can very easily sync with CouchDB.

## Getting Started

    npm install -g timepouch

## Basic Usage

    $ timepouch --help
    Options:
      -d, --display   Display checkins for the current sheet
      -s, --sheet     Select or create a sheet
      -l, --list      Display timesheets
      -i, --in [note] Check in to the current timesheet
      -o, --out       Check out of the current timesheet
      --sync [url]    Sync changes with the CouchDB server at url

The `--at`, `--start`, and `--end` options are available to specify dates/times.

## Example

    $ timepouch -s some-project
    > selected sheet 'some-project'
    $ timepouch -i working on some feature
    > starting task 'working on some feature' at Thu Nov 08 2012 15:22:26 GMT-0700 (MST)
    // work work work...
    $ timepouch -o
    > completed task 'some feature' at Thu Nov 08 2012 15:23:56 GMT-0700 (MST)

When checking in or out, the `--at` option can specify the time you want to
record for that event. This must be a string that Javascript's `Date` class can
parse.

    # check in at a specific time (use --at or --start)
    $ timepouch -i --at '11/8/12 10:37 PM'

    # check out, and set checkout time to 5:00 PM (use --at or --end)
    $ timepouch -o --at 'Nov 7 2012 5:00 PM'

    # check in, and out in one go (use --start and --end, NOT --at)
    $ timepouch -i doin sem stuffs --start 'Nov 8, 2012 9:00' --end 'Nov 8, 2012 17:00'

Note that date parsing isn't very smart, so if you are specifying a date make
sure it's obvious.

# Displaying / querying data

By default, `timepouch -d` will print out all the entries in the currently
selected sheet. You can search and filter by the date, sheet, or note by using
the following options (mix and match as needed):

- `--before [date]` Show entries before the specified date/time
- `--after [date]` Show entries after the specified date/time
- `--sheet [sheet name]` Show entries in another sheet
- `--note [search]` Show entries with a note containing 'search'

# TODO

- Build a web interface to make syncing with a CouchDB useful
- Improve output formatting and reporting
- Add editing
- Improve date parsing and handling of bad dates
