(function () {
  window.App = window.App || {};

  var PASSWORD = "1231";

  App.Access = {
    check: function (value) {
      return String(value == null ? "" : value) === PASSWORD;
    }
  };
})();
