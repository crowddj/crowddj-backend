const functions = require('firebase-functions');
const cors = require('cors')();
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const ascii = /^[ -~]+$/;

function scrubSongName(name) {
  const pattern = /\s*\(.*\)\s*/g;
  return name.replace(pattern, ' ').trim().toLowerCase()
}

function matchesSongMaker(original) {
  return (song) => {
    return scrubSongName(original.name) == scrubSongName(song.name)
  }
}

exports.updateQueueAndPlayed = functions.database.ref('/rooms/{roomID}/current').onWrite(event => {
  const original = event.data.val();
  const matches = matchesSongMaker(original);
  const queuePromise = event.data.ref.parent.child('queue').once('value', (data) => {
    data.forEach((item) => {
      const song = item.val();
      const songName = song['name'];
      if (matches(song)) {
        return item.ref.remove()
      }
    });
  });

  const prev = event.data.previous.val();
  if (!matches(prev)) {
    const newPlayedRef = event.data.ref.parent.child('played').push()
    const playedPromise = newPlayedRef.set(prev);
    return Promise.all([queuePromise, playedPromise])
  } else {
    return queuePromise
  }
});

exports.addToQueue = functions.https.onRequest((req, res) => {
  if (req.method != "POST") {
    res.status(400).send('Must be a POST request');
    return
  }

  const room = req.body.room;
  const songToAdd = req.body.song;

  admin.database().ref('rooms/' + room).once('value', (data) => {
    const exists = (data.val() !== null);
    if (!exists) {
      res.status(400).send('Invalid room');
      return
    }

    const queue = data.child('queue');
    var matched = false;
    const matches = matchesSongMaker(songToAdd);
    queue.forEach((item) => {
      const song = item.val();
      const songName = song['name'];
      if (matches(song)) {
        matched = true;
        item.ref.transaction((item) => {
          if (item) {
            item.upvoteCount++;
          }
          return item
        });
        res.send('OK');
      }
    });

    if (!matched) {
      const newQueueRef = queue.ref.push()
      newQueueRef.set(songToAdd).then(() => {
        res.send('OK');
      })
    }
  });
});
