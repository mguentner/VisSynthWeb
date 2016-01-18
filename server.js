/*
 VisSynthWeb server - a long polling server for remote control
 
 This is a simple HTTP file server, with some special features:
 
 -REST-like long-polling pipeline
  GET requests to any location below the feeds/ path are delayed until information is placed there via a PUT request.
  A requesting client can idle on a GET request, until some remote control puts commands via PUT there. The requesting
  client is then answered immediately and the information dropped. Two web clients can send commands and data to each other
  using two path locations.
  
 -REST-like value store
  PUT requests to any location below the saves/ path store the data given as the request body to disk
  
 -Recorder tool
  the pathes recorder/start and recorder/stop allow to run and stop a hardwired avconv tool process to record the current
  screen content.
 
*/

var http = require('http');

var data={};
var pending={};

var fs=require('fs');
var path=require('path');
var child_process = require('child_process');
var util=require('util');

//var recorder_cmd="avconv -f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov";
var recorder_cmd="avconv";
var recorder_args="-f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov".split(" ");
var recorder=false;

var server=http.createServer(function (req, res) {

  
  console.log("Serving "+req.url);

  var parts = req.url.split('?');
  parts[0]=parts[0].substring(1); // strip trailing /
  var key=parts[0];

  if(req.method=='PUT') {
    // a new value is given, fetch body data and store it
    data[key]='';
    req.on('data',function(chunk){data[key]+=chunk;});
    req.on('end' ,function()
    {
      res.end();

      if (key.match(/sessions\/([a-zA-Z0-9]+)\/chains\/?$/)) {
        // This is a request to store a chain
        session = key.match(/sessions\/([a-zA-Z0-9]+)/)[1];
        chain = JSON.parse(data[key]);
        if (!chain) return;
        // figure out the file name
        if (typeof(chain[0]) != "string" || chain[0].length == 0) return;
        filename = "sessions/" + session + "/chains/" + chain[0].replace(/[^a-zA-Z0-9]/g, "_") + ".chain"
        fs.writeFileSync(filename,data[key]);
        delete data[key];
        console.log(filename+' stored.');
      }
      else if(key.match(/sessions\/([a-zA-Z0-9]+)\/feeds/) && pending[key])
      {
        // if it denotes a feed in feeds/ answer pending requests for this key
        pending[key].end(data[key]);
        delete pending[key];
        delete data[key];
      }
      else
        res.end('Invalid PUT path');
    });
  } else if (req.method == 'GET') {
    if (key.indexOf("..") != -1) return;
    /* Request to list chains for a session */
    if (key.match(/sessions\/([a-zA-Z0-9]+)\/chains\/?$/)) {
      if (fs.existsSync(key) && !fs.statSync(key).isDirectory()) {
        console.log(key+' exists and is not a directory. Please delete it manually!');
        return;
      } else if (!fs.existsSync(key)) {
        /* This is a new session, create directory */
        var session = key.match(/sessions\/([a-zA-Z0-9]+)/)[1];
        var directory = 'sessions/' + session;
        fs.mkdir(directory, '0775');
        console.log(directory + ' created.');
        fs.mkdir(directory + '/chains', '0775');
        console.log(directory + '/chains' + ' created.');
        fs.mkdir(directory + '/recorded', '0775');
        console.log(directory + '/recorded' + ' created.');
        /* Copy chain collection */
        var lsarry = fs.readdirSync('chains');
        lsarry = lsarry.filter(function(e){return !(e.match(/.*\.chain$/) === null)});
        lsarry.forEach(function(chain) {
          var source = 'chains/' + chain;
          var dest   = 'sessions/' + session + '/chains/' + chain;
          fs.writeFileSync(dest, fs.readFileSync(source));
        })
        console.log("Copied chains collections for session >>" + session + "<<");
      }
      var lsarry = fs.readdirSync(key);
      lsarry = lsarry.filter(function(e){return !(e.match(/.*\.chain$/) === null)});
      res.write(JSON.stringify(lsarry));
      res.end();
      console.log(key+' listed.');
    } else if(key.match(/sessions\/([a-zA-Z0-9]+)\/feeds\/.*/)) {
      // data in feeds/ is delivered by long polling
      if(pending[key]) pending[key].end();
      pending[key]=res;
    } else if(key.match(/sessions\/([a-zA-Z0-9]+])\/recorder\/.*/)) {
      if(!recorder && key.match(/sessions\/([a-zA-Z0-9]+)\/recorder\/start/)) {
        var session = key.match(/sessions\/([a-zA-Z0-9]+)/)[1];
        recorder_args.pop();
        recorder_args.push('sessions/' + session + '/recorded/' + Math.floor(new Date() / 1000) + ".mov");
        recorder=child_process.spawn(recorder_cmd,recorder_args, {stdio:'inherit'});
      }
      if(recorder && key.match(/sessions\/([a-zA-Z0-9]+)\/recorder\/stop/)) {
        recorder.kill('SIGTERM');
        recorder=false;
      }
      res.end();
    } else {
     if(fs.existsSync(key) && fs.statSync(key).isFile() && key.indexOf("..")==-1)
      {
        res.setHeader("Content-Type", "text/html");
        var instream=fs.createReadStream(key);
        instream.pipe(res);
      } else
        res.end();
    }
  }
});

var port=8082;
server.listen(port);
console.log("Listening at:%s", port);

