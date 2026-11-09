/* テスト用のにせ Three.js(絵は描かないが、ゲームの動きはそのまま動く)。本物の Three.js がネットから読めないテスト用 */
(function () {
  function S() {
    const store = {};
    const f = function () {};
    return new Proxy(f, {
      get(t, k) { if (k in store) return store[k]; if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; if (k === 'getHexString') return () => 'ffd23f'; store[k] = S(); return store[k]; },
      set(t, k, v) { store[k] = v; return true; },
      apply() { return S(); },
      construct() { return S(); },
    });
  }
  window.THREE = S();
})();
