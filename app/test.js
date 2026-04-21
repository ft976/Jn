const yt = require('youtube-dl-exec');
yt('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { dumpSingleJson: true })
  .then(console.log)
  .catch(console.error);
