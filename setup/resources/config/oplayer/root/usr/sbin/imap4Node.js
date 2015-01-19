/*var server = 'imap.mail.hostpoint.ch';
 var port = 993;
 var username = 'egal@lipsch.ch'
 var password = '1mai_ahoi!!'; */


// package inclusion
var http = require('http');
var qs = require('querystring');
var Imap = require('imap')
inspect = require('util').inspect;



var imap;

// stolen from http://stackoverflow.com/questions/4994201/is-object-empty
var hasOwnProperty = Object.prototype.hasOwnProperty;

function isEmpty(obj) {

    // null and undefined are "empty"
    if (obj == null) return true;

    // Assume if it has a length property with a non-zero value
    // that that property is correct.
    if (obj.length > 0)    return false;
    if (obj.length === 0)  return true;

    // Otherwise, does it have any properties of its own?
    // Note that this doesn't handle
    // toString and valueOf enumeration bugs in IE < 9
    for (var key in obj) {
        if (hasOwnProperty.call(obj, key)) return false;
    }

    return true;
}


// start post msg listener
http.createServer(function (req, res) {
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-type');
    
    if ( req.method === 'OPTIONS' ) {
	
	console.log("got OPTIONS header");
	res.writeHead(200);
	res.end();
	
    } else if(req.method === 'POST') {
	
        req.on('data', function(body) {
            var data = '';
            data += body;
	    
            console.log('got data');
	    var json = JSON.parse(data);
	    console.log('typeof json ' + typeof(json));
	    
            if(typeof(json) === 'object') {
                console.log('received data seems to be json');
		
                if( typeof(json.username) === "string" && typeof(json.password) === "string" ) {
		    
                    //  && typeof(json.host) === "string" && typeof(json.port) === "string" && typeof(json.tls) === "string"
                    console.log("username: " + json.username + " pass: " + json.password + " host: " + json.server + " port: " + json.port + " tls: " + json.tls);

                    // imap setup
                    imap = new Imap({
                        user: json.username,
                        password: json.password,
                        host: json.server,
                        port: json.port,
                        tls: json.tls,
			tlsOptions: {
                             rejectUnauthorized: false
                        }
                    });
		    
                    console.log('imap object instantiated');
		    console.log('connecting');

		    imap.connect();
		    
                    imap.once('ready', function() {
                        openInbox(imap, function(err, box) {
			    
                            if (err) throw err;
			    
                            console.log('connected');
                            res.writeHead(200);
                            res.end('connected');
                        });
			
                    });
		    
                } else if(json.hasOwnProperty('update')) {

/*                    var outputbuffer = {
			
		      }; */
		    var outputbuffer = [];
		    
                    if(typeof(imap) === "object") {
			
			// var getmsgs = function(imap, cb) {
			
			var f = imap.seq.fetch('1:*', {
                            bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                            struct: true
                        });
			
			f.on('message', function (msg, seqno) {

			    console.log('Message #%d', seqno);
			    
                            //outputbuffer[seqno.toString()] = '';
			    
                            var prefix = '(#' + seqno + ') ';
                            msg.on('body', function (stream, info) {
				
				var buffer = '';
                                stream.on('data', function (chunk) {
				    //console.log('chunk: '+ chunk.toString('utf8'));
				    buffer += chunk.toString('utf8');
                                });
				
                                stream.once('end', function () {
				    outputbuffer.push(JSON.stringify(Imap.parseHeader(buffer)));
				    //outputbuffer.push (Imap.parseHeader(buffer, false));
				    
				    //for (var item in JSON.parseImap.parseHeader(buffer, false)){
				    //console.log(item);
				    //}
                                });
                            });
			    
			    msg.once('end', function () {
                                console.log(prefix + 'Finished');
                            });
                        });
			
                        f.once('error', function (err) {
			    console.log('Fetch error: ' + err);
                        });
			
			f.once('end', function () {
                            console.log('Done fetching all messages!');
			    console.log('outputbuffer: ', outputbuffer)
			    //outputbuffer.forEach(function(element, index, array){
			    //console.log(element);
			    //}
			    console.log('type: ', typeof(outputbuffer));
			    
			    if ( !isEmpty(outputbuffer) ){
				res.end(outputbuffer.toString());
			    }
			    else { res.end(null); }
			    
                        });
			
                        imap.once('error', function(err) {
                            console.log(err);
                        });
			
                        imap.once('end', function() {
                            console.log('Connection ended');
                        });
                    } else {
                        res.writeHead(400, "not yet initialized");
                        res.end();
			
                    }
                } else {
                    res.writeHead(400);
                    res.end();
                    console.log("unknown request");
                }
		
            }
	    
	    
        });
	
        function openInbox(imap, cb) {
            imap.openBox('INBOX', true, cb);
        }
	
    } else {
        res.writeHead(400);
        console.log('does not seem to be json');
	res.end();
    }
    
}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');

/*        req.on('end', function() {
 res.end('ended http con');
 }); */







// credentials
/*var server = 'imap.gmail.com';
 var port = 993;
 var username = 'blubb.foo@gmail.com';
 var password = 'Regedit55';

 var credentials = {
 server: 'imap.gmail.com',
 port: '993',
 username: 'blubb.foo@gmail.com',
 password: 'Regedit55',
 tls: true
 }

 { server: 'imap.gmail.com', port: '993', username: 'blubb.foo@gmail.com', password: 'Regedit55'}

 */







/*
 imap.once('ready', function() {
 openInbox(function(err, box) {

 if (err) throw err;

 var outputbuffer = new Array;

 var f = imap.seq.fetch('1:*', {
 bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
 struct: true
 });

 f.on('message', function (msg, seqno) {
 console.log('Message #%d', seqno);
 var prefix = '(#' + seqno + ') ';
 msg.on('body', function (stream, info) {
 var buffer = '';
 stream.on('data', function (chunk) {
 buffer += chunk.toString('utf8');
 });
 stream.once('end', function () {
 //                    console.log(prefix + 'Parsed header: %s', inspect(Imap.parseHeader(buffer)));
 outputbuffer.push(inspect(Imap.parseHeader(buffer)));
 //                  console.log(inspect(Imap.parseHeader(buffer)));
 });
 });
 /*            msg.once('attributes', function(attrs) {
 console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8));
 });
 msg.once('end', function () {
 console.log(prefix + 'Finished');
 });
 }); */

                                // msg.once('attributes', function(attrs) {
                                // console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8));
                                // }); */



			    //        imap.end();
			    //console.log(outputbuffer.toString());
			    //outputbuffer.forEach(function(element, index, array){
			    //console.log("index: ",index,element);
			    //console.log(element.toString());
			    //});



