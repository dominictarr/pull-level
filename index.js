var pull     = require('pull-stream')
var toPull   = require('stream-to-pull-stream')
var pushable = require('pull-pushable')
var cat      = require('pull-cat')
var window   = require('pull-window')
var fixRange = require('level-fix-range')
var post     = require('level-post')

function read(db, opts) {
  return toPull(db.createReadStream(fixRange(opts)))
}

var live = 
exports.live = 
function (db, opts) {
  opts = opts || {}
  fixRange(opts)

  var l = pushable()

  var cleanup = post(db, opts, function (ch) {
    l.push(ch)
  })

  return l.pipe(pull.through(null, cleanup))

}

exports.read =
exports.readStream = 
exports.createReadStream = function (db, opts) {
  opts = opts || {}
  fixRange(opts)
  if(!opts.tail)
    return read(db, opts)

  //optionally notify when we switch from reading history to realtime
  var sync = opts.onSync && function (abort, cb) {
      opts.onSync(); cb(true)
    }

  return cat([read(db, opts), sync, live(db, opts)])
}

exports.write =
exports.writeStream = 
exports.createWriteStream = function (db, opts, done) {
  if('function' === typeof opts)
    done = opts, opts = null
  opts = opts || {}
  return pull.map(function (e) {
    if(e.type) return e
    return {
      key   : e.key, 
      value : e.value,
      type  : e.value == null ? 'del' : 'put'
    }
  })
  .pipe(window(opts.windowSize, opts.windowTime))
  .pipe(pull.asyncMap(function (batch, cb) {
    db.batch(batch, cb)
  }))
  .pipe(pull.onEnd(done))
}

