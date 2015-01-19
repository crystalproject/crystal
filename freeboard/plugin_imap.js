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
//              'file:///home/rekil/git/freeboard/imap/imapbundle.js'
            ""
       ],
        // **settings** : An array of settings that will be displayed for this plugin when the user adds it.
        "settings": [
            {
                'name': 'nodeServerUrl',
                'display_name': 'Node Server URL',
                'type': 'text',
                'required': true
            },
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
            {
                "name": "refresh_time",
                "display_name": "Refresh Time",
                "type": "text",
                "description": "In milliseconds",
                "default_value": 30000
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

        console.log("hello");

        // Good idea to create a variable to hold on to our settings, because they might change in the future. See below.
        var currentSettings = settings;

        var parameters = {
            "username": settings['username'],
            "password": settings['password'],
            'server':settings['server'],
            'port': settings['port'],
            'tls': settings['useTls']
        };
        var jsonParams = JSON.stringify(parameters);


        // send post request with credentials

        xmlhttp = new XMLHttpRequest();
        var url = settings['nodeServerUrl'];

        console.log("send");

        xmlhttp.open("POST", url, true);
        xmlhttp.setRequestHeader("Content-type", "application/json");
//          xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
//        xmlhttp.setRequestHeader("Content-type", "text/plain");
        xmlhttp.send(jsonParams);
//        xmlhttp.onreadystatechange = function () { //Call a function when the state changes.
//            if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
//                alert(xmlhttp.responseText);
//            }
//        }

        console.log("sent");


        /* This is some function where I'll get my data from somewhere */
        function getData() {
	    
            xmlhttp = new XMLHttpRequest();
            xmlhttp.open("POST", url, true);
            xmlhttp.setRequestHeader("Content-type", "application/json");
            xmlhttp.send('{"update":""}');
	    
            xmlhttp.onreadystatechange = function () { //Call a function when the state changes.
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
		    
		    var json = JSON.parse('['+xmlhttp.responseText+']');
		    var html = "<table border=1 frame=below rules=rows width=100\%>";
		    html = html + "<tr> <th>date:</th> <th>to:</th> <th>subject:</th> <th>from:</th> </tr>";

		    for (var element in json) {
			console.log('hallo', 'hey ho');
			console.log(element+' '+json[element]['date']);
			
			html = html + "<tr>";
			html = html + "<td>"+json[element]['date']+"</td>";
			html = html + "<td>"+json[element]['to']+"</td>";
			html = html + "<td>"+json[element]['subject']+"</td>";
			html = html + "<td>"+json[element]['from']+"</td>";
			html = html + "</tr>";
		    }

		    html = html + "</table>" 
		    
		    var maildata = {mails: html};
		    updateCallback(maildata);
		}
		
            };
        };
	
        // send post request with  {'update' : true} json
        // call updateCallback(newData) with the data from the response to the update request

//            var newData = {mails : '<table></table>'};
//            var newData = {mails: xmlhttp.responseText, asdf: 'blabla'};
            // I'm calling updateCallback to tell it I've got new data for it to munch on.


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
