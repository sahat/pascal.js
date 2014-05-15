var RawData = function() {
  this.length = 0;
  this.data = [];
  this.simpleTypeCodes = [];

  this.add = function(datum, simpleTypeCode) {
    this.length++;
    this.data.push(datum);
    this.simpleTypeCodes.push(simpleTypeCode);
  };
};

module.exports = RawData;