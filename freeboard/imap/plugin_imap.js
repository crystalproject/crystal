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
        "type_name": "imap_datasource_plugin",
        // **display_name** : The pretty name that will be used for display purposes for this plugin. If the name is not defined, type_name will be used instead.
        "display_name": "IMAP Datasource Plugin",
        // **description** : A description of the plugin. This description will be displayed when the plugin is selected or within search results (in the future). The description may contain HTML if needed.
        "description": "Some sort of description <strong>with optional html!</strong>",
        // **external_scripts** : Any external scripts that should be loaded before the plugin instance is created.
        "external_scripts": [

              'file:///home/rekil/git/freeboard/imap/imapbundle.js'
       ],
        // **settings** : An array of settings that will be displayed for this plugin when the user adds it.
        "settings": [
            /*
            {
                'name': 'server',
                'display_name': 'IMAP server',
                'type': 'text',
                'description': 'server',
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
            */
            {
                "name": "refresh_time",
                "display_name": "Refresh Time",
                "type": "text",
                "description": "In milliseconds",
                "default_value": 5000
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


    // ### Datasource Implementation
    //
    // -------------------
    // Here we implement the actual datasource plugin. We pass in the settings and updateCallback.
    var myDatasourcePlugin = function (settings, updateCallback) {
        // Always a good idea...
        var self = this;

        console.log('initializing imap datasource plugin');

        // Good idea to create a variable to hold on to our settings, because they might change in the future. See below.
        var currentSettings = settings;

        var server = 'imap.mail.hostpoint.ch';
        var port = 993;
        var username = 'egal@lipsch.ch'
        var password = '1mai_ahoi!!';


        var imap = new Imap({
            user: username,
            password: password,
            host: server,
            port: port,
            tls: true
        });

        function openInbox(cb) {
            imap.openBox('INBOX', true, cb);
        }

        imap.once('ready', function() {

            openInbox(function(err, box) {

                if (err) throw err;

                var f = imap.seq.fetch('*', {
                    bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                    struct: true
                });
                f.on('message', function(msg, seqno) {
                    console.log('Message #%d', seqno);
                    var prefix = '(#' + seqno + ') ';
                    msg.on('body', function(stream, info) {
                        var buffer = '';
                        stream.on('data', function(chunk) {
                            buffer += chunk.toString('utf8');
                        });
                        stream.once('end', function() {
                            console.log(prefix + 'Parsed header: %s', inspect(Imap.parseHeader(buffer)));
                        });
                    });
                    msg.once('attributes', function(attrs) {
                        console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8));
                    });
                    msg.once('end', function() {
                        console.log(prefix + 'Finished');
                    });
                });
                f.once('error', function(err) {
                    console.log('Fetch error: ' + err);
                });
                f.once('end', function() {
                    console.log('Done fetching all messages!');
                    imap.end();
                });
            });
        });

        imap.once('error', function(err) {
            console.log(err);
        });

        imap.once('end', function() {
            console.log('Connection ended');
        });

        imap.connect();

        console.log('initialized imap datasource plugin');


        /* This is some function where I'll get my data from somewhere */
        function getData() {


            console.log('getData called');
            var newData = {foobar: 'fooobar '+ new Date().toLocaleTimeString()};


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


    // ## A Widget Plugin
    //
    // -------------------
    // ### Widget Definition
    //
    // -------------------
    // **freeboard.loadWidgetPlugin(definition)** tells freeboard that we are giving it a widget plugin. It expects an object with the following:
    freeboard.loadWidgetPlugin({
        // Same stuff here as with datasource plugin.
        "type_name": "my_widget_plugin",
        "display_name": "Widget Plugin Example",
        "description": "Some sort of description <strong>with optional html!</strong>",
        // **external_scripts** : Any external scripts that should be loaded before the plugin instance is created.
        "external_scripts": [
            "http://mydomain.com/myscript1.js", "http://mydomain.com/myscript2.js"
        ],
        // **fill_size** : If this is set to true, the widget will fill be allowed to fill the entire space given it, otherwise it will contain an automatic padding of around 10 pixels around it.
        "fill_size": false,
        "settings": [
            {
                "name": "the_text",
                "display_name": "Some Text",
                // We'll use a calculated setting because we want what's displayed in this widget to be dynamic based on something changing (like a datasource).
                "type": "calculated"
            },
            {
                "name": "size",
                "display_name": "Size",
                "type": "option",
                "options": [
                    {
                        "name": "Regular",
                        "value": "regular"
                    },
                    {
                        "name": "Big",
                        "value": "big"
                    }
                ]
            }
        ],
        // Same as with datasource plugin, but there is no updateCallback parameter in this case.
        newInstance: function (settings, newInstanceCallback) {
            newInstanceCallback(new myWidgetPlugin(settings));
        }
    });

    // ### Widget Implementation
    //
    // -------------------
    // Here we implement the actual widget plugin. We pass in the settings;
    var myWidgetPlugin = function (settings) {
        var self = this;
        var currentSettings = settings;

        // Here we create an element to hold the text we're going to display. We're going to set the value displayed in it below.
        var myTextElement = $("<span></span>");

        // **render(containerElement)** (required) : A public function we must implement that will be called when freeboard wants us to render the contents of our widget. The container element is the DIV that will surround the widget.
        self.render = function (containerElement) {
            // Here we append our text element to the widget container element.
            $(containerElement).append(myTextElement);
        }

        // **getHeight()** (required) : A public function we must implement that will be called when freeboard wants to know how big we expect to be when we render, and returns a height. This function will be called any time a user updates their settings (including the first time they create the widget).
        //
        // Note here that the height is not in pixels, but in blocks. A block in freeboard is currently defined as a rectangle that is fixed at 300 pixels wide and around 45 pixels multiplied by the value you return here.
        //
        // Blocks of different sizes may be supported in the future.
        self.getHeight = function () {
            if (currentSettings.size == "big") {
                return 2;
            }
            else {
                return 1;
            }
        }

        // **onSettingsChanged(newSettings)** (required) : A public function we must implement that will be called when a user makes a change to the settings.
        self.onSettingsChanged = function (newSettings) {
            // Normally we'd update our text element with the value we defined in the user settings above (the_text), but there is a special case for settings that are of type **"calculated"** -- see below.
            currentSettings = newSettings;
        }

        // **onCalculatedValueChanged(settingName, newValue)** (required) : A public function we must implement that will be called when a calculated value changes. Since calculated values can change at any time (like when a datasource is updated) we handle them in a special callback function here.
        self.onCalculatedValueChanged = function (settingName, newValue) {
            // Remember we defined "the_text" up above in our settings.
            if (settingName == "the_text") {
                // Here we do the actual update of the value that's displayed in on the screen.
                $(myTextElement).html(newValue);
            }
        }

        // **onDispose()** (required) : Same as with datasource plugins.
        self.onDispose = function () {
        }
    }
}());