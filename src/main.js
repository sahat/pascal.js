define([
  'camelize',
  'capitalize',
  'dasherize',
  'random',
  'slugify',
  'trim'
], function(camelize, capitalize, dasherize, random, slugify, trim) {

  // Object Contructor
  var Pascal = function(obj) {
    return obj;
  };

  // Properties
  Pascal.VERSION = '0.0.1';

  // Methods
  Pascal.camelize = camelize;
  Pascal.capitalize = capitalize;
  Pascal.dasherize = dasherize;
  Pascal.random = random;
  Pascal.slugify = slugify;
  Pascal.trim = trim;

  return Pascal;
});