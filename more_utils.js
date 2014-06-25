String.prototype.cutFromLastIndexOf = function (searchValue, fromIndex) {
    var whatIsLeft = this,
        lastIndex = -1;

    if (fromIndex) {
        lastIndex = this.lastIndexOf(searchValue, fromIndex);
    } else {
        lastIndex =  this.lastIndexOf(searchValue);
    }

    if (lastIndex > 0) {
        whatIsLeft = this.substr(lastIndex + 1, this.length - lastIndex);
    }

    return whatIsLeft;
};

String.prototype.cutUpToLastIndexOf = function (searchValue, fromIndex) {
    var whatIsLeft = this,
        lastIndex = -1;

    if (fromIndex) {
        lastIndex = this.lastIndexOf(searchValue, fromIndex);
    } else {
        lastIndex =  this.lastIndexOf(searchValue);
    }

    if (lastIndex > 0) {
        whatIsLeft = this.substr(0, lastIndex);
    }

    return whatIsLeft;
};

if (!String.prototype.trim) {
    String.prototype.trim=function(){return this.replace(/^\s+|\s+$/g, '');};
}

String.prototype.ltrim=function(){return this.replace(/^\s+/,'');};

String.prototype.rtrim=function(){return this.replace(/\s+$/,'');};

String.prototype.fulltrim=function(){return this.replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g,'').replace(/\s+/g,' ');};