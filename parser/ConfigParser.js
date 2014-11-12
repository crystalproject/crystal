var fs = require('fs');
var argv = require('yargs').argv;


var validator = require('./ConfigValidator');
var stage = require('./ConfigStage');
var setup = require('./ConfigSetup');
var run = require('./ConfigRun');


// usage
var USAGE = 'USAGE: node ConfigParser.js -f <ConfigFile> [--stage][--setup][--run][--help]';


// check the command line arguments

if (argv.h) {
    console.log('akjfksafj' + USAGE);
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

if (modes != 1) {
    // no mode or more than one mode set
    console.log(USAGE);
    process.exit(1);
}


var fileName = argv.f;


// todo in ConfigStage verlagern?
// parse the JSON file
try {
    var fd = fs.readFileSync(fileName);
    var json = JSON.parse(fd);
} catch (e) {
    console.error('failed to parse file \'' + fileName + '\': ' + e);
    process.exit(1);
}

if (argv.stage) {

// validate JSON config file
    if (!validator.validate(json, false)) {
        process.exit(1);
    }

    // STAGE mode: write the scenario files
    if (!stage.writeScenarioFiles(json)) {
        process.exit(1);
    }
    console.log('successfully processed ' + fileName + ' for mode STAGE');

} else if (argv.setup) {

    // validate JSON config file
    if (!validator.validate(json, false)) {
        process.exit(1);
    }

    if (!setup.setup(json)) {
        process.exit(1);
    }

} else if (argv.run) {

    // validate JSON config file
    if (!validator.validate(json, true)) {
        process.exit(1);
    }

    if (!run.run(json)) {
        process.exit(1);
    }
}




