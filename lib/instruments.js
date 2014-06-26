config      = require('./config');

var instruments = {
    config: {
      active: config.active || true,
      exclude: config.exclude || [],
      lookup: config.lookup
    },

    isActive: function () {

    },

  shouldWrapFunction: function (filename, signature) {
    filename = this.shortenFileName(filename);

    var module = instruments.config.lookup.filter(function (item) {
        return (item.sourceFile === filename);
    });

    if (module.length === 1) {
        if (module[0].selected === true) {
            return true;
        }
    }
    return false;
  },

  shortenFileName: function (filename) {
    return filename.cutFromLastIndexOf('/');
  },

  getModuleNameFromFilename: function (filename) {
    return this.shortenFileName(filename).cutUpToLastIndexOf('.');
  },

  // Need to extend this one to include module sub pathes
  isModuleIncluded: function (filename) {
    var moduleName = this.getModuleNameFromFilename(filename);

    return (instruments.config.exclude.indexOf(moduleName) === -1);
  }
};

module.exports = instruments;