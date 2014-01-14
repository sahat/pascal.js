var Native = function () {
  this.nativeProcedures = [];

  this.add = function (nativeProcedure) {
    var index = this.nativeProcedures.length;
    this.nativeProcedures.push(nativeProcedure);
    return index;
  };

  this.get = function (index) {
    return this.nativeProcedures[index];
  };
};

module.exports = Native;