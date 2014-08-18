/* NOTE: this is an unsafe Set impl, which assumes
    the values are already distinct, and do not use the hashFunction */


function Set(/* hashFunction */) { // ignore the hash function, see NOTE above
    //this._hashFunction = hashFunction || JSON.stringify;
    this._values = {};
    this._size = 0;
}

Set.prototype = {
    add: function add(value) {
        if (!this.contains(value)) {
            this._values[value] = value;
            this._size++;
        }
    },

    remove: function remove(value) {
        if (this.contains(value)) {
            delete this._values[value];
            this._size--;
        }
    },

    contains: function contains(value) {
        return typeof this._values[value] !== "undefined";
    },

    size: function size() {
        return this._size;
    },

    each: function each(iteratorFunction, thisObj) {
        for (var value in this._values) {
            iteratorFunction.call(thisObj, this._values[value]);
        }
    }
};

module.exports = Set;