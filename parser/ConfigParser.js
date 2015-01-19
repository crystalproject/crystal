var fs = require('fs');
var argv = require('yargs').argv;
var os = require('os');


var utilities = require('./ConfigUtilities');
var validator = require('./ConfigValidator');
var stage = require('./ConfigStage');
var setup = require('./ConfigSetup');
var run = require('./ConfigRun');
var cleanup = require('./ConfigCleanup');

var EOL = os.EOL;

// usage
var USAGE = 'USAGE: node ConfigParser.js -f <ConfigFile> [--stage] [--setup] [--run] [--cleanup] [--help]' + EOL +
    '--stage  : run STAGE mode' + EOL +
    '--setup  : run SETUP mode:' + EOL +
    '           --one_auth <path of one_auth file>' + EOL +
    '--run    : run RUN mode' + EOL +
    '--cleanup: run CLEANUP mode:' + EOL +
    '           --one_auth <path of one_auth file>' + EOL +
    '           [--del_vms=yes/No]   : delete VMs' + EOL +
    '           [--del_images=yes/No]: delete images' + EOL +
    '           [--del_vnets=yes/No] : delete vnets and bridges' + EOL +
    '--help';

// check the command line arguments

if (argv.h) {
    console.log(USAGE);
    process.exit(0);
}

// check for mandatory -f configfile
if (!argv.f) {
    // missing -f configfile
    console.log(USAGE);
    process.exit(1);
}

// check if a mode is set
var modes = 0;
if (argv.stage) {
    modes++;
}
if (argv.setup) {
    modes++;
}
if (argv.run) {
    modes++;
}
if (argv.cleanup) {
    modes++;
}

if (modes != 1) {
    // no mode or more than one mode set
    console.log(USAGE);
    process.exit(1);
}


var fileName = argv.f;


// parse the JSON file
var json = validator.parse(fileName);
if (!json) {
    process.exit(1);
}

if (argv.stage) {

// validate JSON config file
    if (!validator.validate(json, false)) {
        process.exit(1);
    }

    // STAGE mode: write the scenario files
    if (!stage.doStage(json)) {
        process.exit(1);
    }
    console.log('successfully processed ' + fileName + ' for mode STAGE');

} else if (argv.setup) {

    if (!argv.one_auth) {
        console.log('missing option --one_auth');
        console.log(USAGE);
        process.exit(1);
    }

    // validate JSON config file
    if (!validator.validate(json, false)) {
        process.exit(1);
    }

    if (!setup.doSetup(json, argv.one_auth)) {
        process.exit(1);
    }

} else if (argv.run) {

    // validate JSON config file
    if (!validator.validate(json, true)) {
        process.exit(1);
    }

    if (!run.doRun(json)) {
        process.exit(1);
    }

} else if (argv.cleanup) {

    if (!argv.one_auth) {
        console.log('missing option --one_auth');
        console.log(USAGE);
        process.exit(1);
    }

    // validate JSON config file
    if (!validator.validate(json, true)) {
        process.exit(1);
    }

    var deleteVms = false;
    var deleteImages = false;
    var deleteVnets = false;
    if (argv.del_vms) {
        deleteVms = utilities.isYes(argv.del_vms);
    }
    if (argv.del_images) {
        deleteImages = utilities.isYes(argv.del_images);
    }
    if (argv.del_vnets) {
        deleteVnets = utilities.isYes(argv.del_vnets);
    }

    // validate JSON config file
    if (!validator.validate(json, true)) {
        process.exit(1);
    }

    cleanup.doCleanup(json, argv.one_auth, deleteVnets, deleteImages, deleteVms);
}
