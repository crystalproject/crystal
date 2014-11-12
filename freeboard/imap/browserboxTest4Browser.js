/**
 * Created by rekil on 30.10.14.
 */

var server = 'imap.mail.hostpoint.ch';
var port = 993;
var username = 'egal@lipsch.ch'
var password = '1mai_ahoi!!';
var useTLS = true;

var BrowserBox = require('browserbox');

console.log('before Browserbox');
var client = new BrowserBox(server, port, {
    auth: {
        user: username,
        pass: password
    },
    useSecureTransport: useTLS
});

console.log('after Browserbox');


client.onerror = function (err) {
    console.log('error occurred: ' + err);
};
client.onclose = function () {
    console.log('imap connection closed');
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

                            var mail = message['envelope']['subject'] + ', sender: ' + message['envelope']['sender'][0]['name'] + ' timestamp: ' + new Date(message['envelope']['date']).toLocaleTimeString();
                            mails = mails + '\n' + mail;
                            console.log('***** message: ' + mail);
                        });
                    }
                }
            );
        }
    });
}

client.connect();
