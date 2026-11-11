# tv-claude

Module TizenBrew pour TV Samsung Tizen (testé sur une QE55Q8FAM, Tizen 3.0, 2017).

- Charge le **TizenTube officiel** (`npm/@foxreis/tizentube`, dernière version) : YouTube sans pub.
- Démarre un petit service de **captures d'écran** de la TV : `http://<IP-TV>:8097/shot` (JPEG 480×270), `http://<IP-TV>:8097/ping`.
  Il passe par le service système `display-capture-service` (D-Bus `samsung.tizen.dcapture`), méthode découverte par [Edsol/t3](https://github.com/Edsol/t3).

Installation : TizenBrew → gestionnaire de modules → « Ajouter un Module GitHub » → `Holdwig44/tv-claude`, puis le mettre en AutoLaunch à la place de TizenTube.

Le service ne modifie rien sur la TV et n'a pas d'authentification : il est lisible par tout appareil du réseau local.
