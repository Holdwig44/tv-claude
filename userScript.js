/* TizenTube + Claude : charge le script officiel de TizenTube (derniere version publiee sur npm). */
(function () {
    var URL_TT = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js';
    try {
        var x = new XMLHttpRequest();
        x.open('GET', URL_TT, false);
        x.send(null);
        if (x.status === 200 && x.responseText) {
            (0, eval)(x.responseText);
            return;
        }
    } catch (e) { }
    var s = document.createElement('script');
    s.src = URL_TT;
    (document.head || document.documentElement).appendChild(s);
})();
