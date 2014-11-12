var BrowserBox = require('browserbox');

var server = 'imap.mail.hostpoint.ch';
var port = 993;
var username = 'egal@lipsch.ch'
var password = '1mai_ahoi!!';

var client = new BrowserBox(server, port, {
    auth: {
        user: username,
        pass: password
    },
    useSecureTransport: true
});

client.onerror = function (err) {
    console.log('error occurred: ' + err);
};
client.onclose = function () {
    console.log('imap connection closed');
}

client.onupdate = function(type, value){
    if (type == 'exists') {
        console.log(value + ' messages exists in selected mailbox');
    }
}

client.onauth = function () {
    console.log('user successfully authenticated');

    client.selectMailbox('INBOX', function (err, mailbox) {
        if (err) {
            console.log('selectMailbox failed: ' + err);
        } else {
            client.listMessages('*', ['envelope'], function (err, messages) {
                    if (err) {
                        console.log('listMessages failed: ' + err);
                    } else {
                        messages.forEach(function (message) {
                            var env = message['envelope'];
                            console.log('***** message: ' + message['envelope']['subject'] + ', sender: ' + message['envelope']['sender'][0]['name'] + ' timestamp: ' + new Date(message['envelope']['date']).toLocaleTimeString());
                        });
                    }
                }
            );
        }
    });
}

client.connect();
