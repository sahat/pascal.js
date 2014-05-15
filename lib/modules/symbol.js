var Symbol = function(name, type, address) {
  this.name = name;
  this.type = type;
  this.address = address;
  this.isNative = false;
  this.value = null;
};

module.exports = Symbol;
