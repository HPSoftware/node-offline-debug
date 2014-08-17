function Set(hashFunction) {
    this._hashFunction = hashFunction || JSON.stringify;
    this._values = {};
    this._size = 0;
}

Set.prototype = {
    add: function add(value) {
        if (!this.contains(value)) {
            this._values[this._hashFunction(value)] = value;
            this._size++;
        }
    },

    remove: function remove(value) {
        if (this.contains(value)) {
            delete this._values[this._hashFunction(value)];
            this._size--;
        }
    },

    contains: function contains(value) {
        return typeof this._values[this._hashFunction(value)] !== "undefined";
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

