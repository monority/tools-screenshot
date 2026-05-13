var once = require('once')
var reqs = Object.create(null)

module.exports = function inflight(key, cb) {
  if (reqs[key]) {
    reqs[key].push(cb)
    return null
  } else {
    reqs[key] = [cb]
    return once(function () {
      var cbs = reqs[key]
      if (!cbs) return
      delete reqs[key]
      for (var i = 0; i < cbs.length; i++) {
        cbs[i].apply(null, arguments)
      }
    })
  }
}
