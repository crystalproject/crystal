// # Building a Freeboard Plugin
//
// A freeboard plugin is simply a javascript file that is loaded into a web page after the main freeboard.js file is loaded.
//
// Let's get started with an example of a datasource plugin and a widget plugin.
//
// -------------------

// Best to encapsulate your plugin in a closure, although not required.
(function () {
    // ## A Datasource Plugin
    //
    // -------------------
    // ### Datasource Definition
    //
    // -------------------
    // **freeboard.loadDatasourcePlugin(definition)** tells freeboard that we are giving it a datasource plugin. It expects an object with the following:
    freeboard.loadDatasourcePlugin({
        // **type_name** (required) : A unique name for this plugin. This name should be as unique as possible to avoid collisions with other plugins, and should follow naming conventions for javascript variable and function declarations.
        "type_name": "browserbox_datasource_plugin",
        // **display_name** : The pretty name that will be used for display purposes for this plugin. If the name is not defined, type_name will be used instead.
        "display_name": "Browserbox Datasource Plugin",
        // **description** : A description of the plugin. This description will be displayed when the plugin is selected or within search results (in the future). The description may contain HTML if needed.
        "description": "IMAP client with browserbox",
        // **external_scripts** : Any external scripts that should be loaded before the plugin instance is created.
        "external_scripts": [
            "http://mydomain.com/myscript1.js",
            "http://mydomain.com/myscript2.js"
        ],
        // **settings** : An array of settings that will be displayed for this plugin when the user adds it.
        "settings": [
            {
                'name': 'server',
                'display_name': 'IMAP server',
                'type': 'text',
                'description': 'server URL',
                'required': true
            },
            {
                'name': 'port',
                'display_name': 'Port',
                'type': 'number',
                'required': true
            },
            {
                'name': 'useTls',
                'display_name': 'use TLS',
                // **type "boolean"** : Will display a checkbox indicating a true/false setting.
                'type': 'boolean',
                'default_value': true
            },
            {
                'name': 'username',
                'display_name': 'User Name',
                'type': 'text',
                'required': true
            },
            {
                'name': 'password',
                'display_name': 'Password',
                'type': 'text',
                'required': true
            },
            {
                "name": "refresh_time",
                "display_name": "Refresh Time",
                "type": "text",
                "description": "In milliseconds",
                "default_value": 60000
            }
        ],
        // **newInstance(settings, newInstanceCallback, updateCallback)** (required) : A function that will be called when a new instance of this plugin is requested.
        // * **settings** : A javascript object with the initial settings set by the user. The names of the properties in the object will correspond to the setting names defined above.
        // * **newInstanceCallback** : A callback function that you'll call when the new instance of the plugin is ready. This function expects a single argument, which is the new instance of your plugin object.
        // * **updateCallback** : A callback function that you'll call if and when your datasource has an update for freeboard to recalculate. This function expects a single parameter which is a javascript object with the new, updated data. You should hold on to this reference and call it when needed.
        newInstance: function (settings, newInstanceCallback, updateCallback) {
            // myDatasourcePlugin is defined below.
            newInstanceCallback(new myDatasourcePlugin(settings, updateCallback));
        }
    });

    var mails = '<div style="overflow: scroll; heigth: 100%"><table></table></div> ';

    // ### Datasource Implementation
    //
    // -------------------
    // Here we implement the actual datasource plugin. We pass in the settings and updateCallback.
    var myDatasourcePlugin = function (settings, updateCallback) {
        // Always a good idea...
        var self = this;

        // Good idea to create a variable to hold on to our settings, because they might change in the future. See below.
        var currentSettings = settings;

        var client = new BrowserBox(settings['server'], settings['port'], {
            auth: {
                user: settings['username'],
                pass: settings['password']
            },
            useSecureTransport: settings['useTls']
        });


        client.onerror = function (err) {
            console.log('error occurred: ' + err);
        };
        client.onclose = function () {
            console.log('imap connection closed');
        }

        client.onauth = function () {
            console.log('user successfully authenticated');
            mails = '<div style="overflow: scroll; heigth: 100%"><table>';

            client.selectMailbox('INBOX', function (err, mailbox) {
                if (err) {
                    console.log('selectMailbox failed: ' + err);
                    mails = mails + '</table></div> ';
                } else {
                    client.listMessages('*', ['envelope'], function (err, messages) {
                            if (err) {
                                console.log('listMessages failed: ' + err);
                                mails = mails + '</table></div> ';
                            } else {
                                messages.forEach(function (message) {

                                    var mail = '<tr><td>'
                                        + message['envelope']['subject']
                                        + '</td><td>'
                                        + message['envelope']['sender'][0]['name']
                                        + '</td><td>' + new Date(message['envelope']['date']).toLocaleTimeString()
                                        + '</td></tr>';
                                    var mail = message['envelope']['subject'] + ', sender: ' + message['envelope']['sender'][0]['name'] + ' timestamp: ' + new Date(message['envelope']['date']).toLocaleTimeString();
                                    mails = mails + '\n' + mail;
                                    console.log('***** message: ' + mail);
                                });
                                mails = mails + '</table></div> ';
                            }
                        }
                    );
                }
            });
        }

        client.connect();

        /* This is some function where I'll get my data from somewhere */

        function getData() {

            var newData = {mails: mails};


            var i = 0;
            var newData = {
                mails: ' <div style="overflow: scroll; height: 100%">' +
                '<table>' +
                '<tr>' +
                '<td>subject</td>' +
                '<td>sender</td>' +
                '<td>timestamp</td>' +
                '</tr>' +
                '<td>' +
                ('subject ' + i++) +
                '</td>' +
                '<td>' +
                ('sender ' + i++) +
                '</td>' +
                '<td>' +
                new Date().toLocaleTimeString() +
                '</td>' +
                '</tr>' +
                '</tr>' +
                '<td>' +
                ('subject ' + i++) +
                '</td>' +
                '<td>' +
                ('sender ' + i++) +
                '</td>' +
                '<td>' +
                new Date().toLocaleTimeString() +
                '</td>' +
                '</tr>' +
                '</tr>' +
                '<td>' +
                ('subject ' + i++) +
                '</td>' +
                '<td>' +
                ('sender ' + i++) +
                '</td>' +
                '<td>' +
                new Date().toLocaleTimeString() +
                '</td>' +
                '</tr>' +
                '</tr>' +
                '<td>' +
                ('subject ' + i++) +
                '</td>' +
                '<td>' +
                ('sender ' + i++) +
                '</td>' +
                '<td>' +
                new Date().toLocaleTimeString() +
                '</td>' +
                '</tr>' +
                '</tr>' +
                '<td>' +
                ('subject ' + i++) +
                '</td>' +
                '<td>' +
                ('sender ' + i++) +
                '</td>' +
                '<td>' +
                new Date().toLocaleTimeString() +
                '</td>' +
                '</tr>' +
                '</tr>' +
                '<td>' +
                ('subject ' + i++) +
                '</td>' +
                '<td>' +
                ('sender ' + i++) +
                '</td>' +
                '<td>' +
                new Date().toLocaleTimeString() +
                '</td>' +
                '</tr>' +
                '</tr>' +
                '<td>' +
                ('subject ' + i++) +
                '</td>' +
                '<td>' +
                ('sender ' + i++) +
                '</td>' +
                '<td>' +
                new Date().toLocaleTimeString() +
                '</td>' +
                '</tr>' +
                '</table>' +
                '</div> '
            };


            // I'm calling updateCallback to tell it I've got new data for it to munch on.
            updateCallback(newData);
        }

        // You'll probably want to implement some sort of timer to refresh your data every so often.
        var refreshTimer;

        function createRefreshTimer(interval) {
            if (refreshTimer) {
                clearInterval(refreshTimer);
            }

            refreshTimer = setInterval(function () {
                // Here we call our getData function to update freeboard with new data.
                getData();
            }, interval);
        }

        // **onSettingsChanged(newSettings)** (required) : A public function we must implement that will be called when a user makes a change to the settings.
        self.onSettingsChanged = function (newSettings) {
            // Here we update our current settings with the variable that is passed in.
            currentSettings = newSettings;
        }

        // **updateNow()** (required) : A public function we must implement that will be called when the user wants to manually refresh the datasource
        self.updateNow = function () {
            // Most likely I'll just call getData() here.
            getData();
        }

        // **onDispose()** (required) : A public function we must implement that will be called when this instance of this plugin is no longer needed. Do anything you need to cleanup after yourself here.
        self.onDispose = function () {
            // Probably a good idea to get rid of our timer.
            clearInterval(refreshTimer);
            refreshTimer = undefined;
        }

        // Here we call createRefreshTimer with our current settings, to kick things off, initially. Notice how we make use of one of the user defined settings that we setup earlier.
        createRefreshTimer(currentSettings.refresh_time);
    }

}());