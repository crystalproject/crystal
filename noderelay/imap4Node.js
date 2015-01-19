// package inclusion
var http = require('http');
var qs = require('querystring');
var Imap = require('imap');
var imap;
var is_connected = false;
var outputbuffer = [];

var mbox = null;

inspect = require('util').inspect;

http.createServer(function (req, res) {
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-type');
    
    if ( req.method === 'OPTIONS' ) {
        console.log('remote addr ' + req.connection.remoteAddress);
	res.writeHead(200);
	res.end();
	
    } else if(req.method === 'POST') {
	
        req.on('data', function(body) {
            var data = '';
            data += body;
            var json = JSON.parse(data);
	    
            if(typeof(json) === 'object') {
		
                if( typeof(json.username) === "string" && typeof(json.password) === "string" ) {
		    
		    // imap setup
		    imap = new Imap({
                    	user: json.username,
                        password: json.password,
                        host: json.server,
                        port: json.port,
                        tls: json.tls,
                        debug: console.error,
                        tlsOptions:{ rejectUnauthorized: false }
                    });
		    
		    imap.connect();
		    
                    imap.once('ready', function() {
			
                    	openInbox(imap, function(err, box) {
                    	    if (err) throw err;
			    mbox = box;
                            is_connected = true;
                            res.writeHead(200);
                            res.end('connected');
                        });
			
                    });

                } else if(json.hasOwnProperty('update')) {
		    
                    if(typeof(imap) === "object" && is_connected === true) {
			
                	outputbuffer = [];

			//if(!mbox.messages.total) {
			//  console.log("mbox empty, should not fetch");
			//  console.log("/*********\n\n\nmbox empty, should not fetch \n\n\n **********/");
			//} else {
			//console.log("/*********\n\n\nnum messages in mbox: " + mbox.messages.total + "\n\n\n **********/");
			//}

			if(mbox.messages.total) {
			
                    	var f = imap.seq.fetch('1:*', {
                    	    bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                            struct: true
                        });
			
                    	f.on('message', function (msg, seqno) {
			    
                    	    var prefix = '(#' + seqno + ') ';
			    
                            msg.on('body', function (stream, info) {
                            	
                            	var buffer = '';
                                stream.on('data', function (chunk) {
                                    buffer += chunk.toString('utf8');
                                });

                                stream.once('end', function () {
				    outputbuffer.push(JSON.stringify(Imap.parseHeader(buffer)));
                                });
				
                            });
			    
                            msg.once('end', function () {
                                console.log(prefix + 'Finished');
                            });
                        });
			
                        f.once('error', function (err) {
                            console.log('Imap4Node fetch error: ' + err);
                        });
			
                        f.once('end', function () {
                            res.end(outputbuffer.toString());
                        });
			}
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
    
}).listen(1234, '127.0.0.1');
