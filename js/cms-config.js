/**
 * WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208
 * Public Website CMS Connector Configuration
 * Configure production API base URL (e.g. 'https://api.wdpcs.in') when deployed.
 * Never store admin credentials or secrets in public files.
 */
(function () {
  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  window.WDPCS_CMS_CONFIG = window.WDPCS_CMS_CONFIG || {
    apiBaseUrl: isLocal ? 'http://127.0.0.1:4000' : ''
  };
})();

