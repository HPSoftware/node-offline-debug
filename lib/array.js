Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
};

Array.prototype.asObjects = function () {
    var objArgs = Array.prototype.slice.call(this).reduce(function(o, v, i) {
        o[i] = v;
      return o;
    }, {});

    return objArgs;
};

Array.prototype.toStringsArray = function () {
    var retValue = [];
    for (var index = 0; index < this.length; index++) {
        if (this[index] === null) {
            retValue.push('null');
        } else {
            if (this[index] === undefined) {
                retValue.push('undefined');
            } else {
                if (typeof this[index] === "object") {
                    switch (Object.prototype.toString.call(this[index])) {
                        case '[object Object]':
                            retValue.push(this[index].constructor.name + " (object)");
                            break;
                        case '[object Array]':
                            retValue.push(JSON.stringify(this[index]));
                            break;
                        default:
                            retValue.push(String(this[index]));
                            break;
                    }
                } else {
                    retValue.push(String(this[index]));
                }
            }
        }
    }

    return retValue;
};