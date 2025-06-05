// main.js

// → Variables globales pour stocker les données issues des deux JSON
let produits = [];    // On y stockera les objets dont "Référence", "Nom", "Poids_unité", "Volume_unité"
let conteneurs = [];  // On y stockera les objets dont "NAME ", "ID ", "Poids_max", "Capacite_plus_de_quatre", etc.

window.addEventListener("DOMContentLoaded", async () => {
  await chargerDonnees();        // 1. On charge les JSON au démarrage
  genererTableProduits();        // 2. On remplit dynamiquement le tableau des produits
  genererSelectConteneurs();     // 3. On remplit la liste déroulante des conteneurs
  document.getElementById("btn-calculer")
          .addEventListener("click", traiterCalcul);
});

/**
 * 1. Charger les JSON “produits.json” et “conteneurs.json”
 */
async function chargerDonnees() {
  try {
    const [respP, respC] = await Promise.all([
      fetch("produits.json"),
      fetch("conteneurs.json")
    ]);
    if (!respP.ok || !respC.ok) {
      throw new Error("Impossible de charger les fichiers JSON.");
    }
    produits = await respP.json();
    conteneurs = await respC.json();

    // Filtrer éventuellement les produits dont "Référence" est null (on les ignore)
    produits = produits.filter(p => p["Référence"] !== null);
  } catch (err) {
    alert("Erreur lors du chargement des données : " + err.message);
    console.error(err);
  }
}

/**
 * 2. Générer dynamiquement les lignes du tableau des produits
 */
function genererTableProduits() {
  const tbody = document.querySelector("#table-produits tbody");
  tbody.innerHTML = ""; // Vide si nécessaire

  produits.forEach((prod, index) => {
    // prod contient, par exemple :
    // {
    //   "Product": "ALBEN 2500 ",
    //   "Référence": "ALB25V_50",
    //   "Nom": "...",          // On a renommé la colonne “Nom_produit” en “Nom” via Python
    //   "Poids_unité": 0.023333333,
    //   "Volume_unité": 0.000094,
    //   ...
    // }
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${prod["Référence"]}</td>
      <td>${prod["Nom"] || ""}</td>
      <td>${parseFloat(prod["Poids_unité"]).toLocaleString("fr-FR", { minimumFractionDigits: 3 })}</td>
      <td>${parseFloat(prod["Volume_unité"]).toLocaleString("fr-FR", { minimumFractionDigits: 6 })}</td>
      <td>
        <input
          type="number"
          min="0"
          step="1"
          value="0"
          id="quantite-${index}"
          style="width: 60px;"
        />
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * 3. Générer le <select> des conteneurs
 */
function genererSelectConteneurs() {
  const select = document.getElementById("select-conteneur");
  select.innerHTML = `<option value="">-- Choisir un conteneur --</option>`;

  conteneurs.forEach((cont) => {
    // cont ressemble à :
    // {
    //   "NAME ": "TC20",
    //   "ID ": 201,
    //   "Poids_max": 28000,
    //   "Capacite_plus_de_quatre": 29.5,
    //   "Capacite_quatre_ou_moins": 31,
    //   "Cout_du_conteneur": 25000,
    //   "Allowed": "J1,J2,J3,…"
    // }
    const codeCont = cont["NAME "]?.trim(); 
    const idOrigine = String(cont["ID "]); // pas forcément utilisé, mais on a l’ID d’origine
    const volPlus4 = parseFloat(cont["Capacite_plus_de_quatre"]);
    const poidsMax = parseFloat(cont["Poids_max"]);

    const opt = document.createElement("option");
    // On utilise le champ “NAME ” (ex. "TC20") comme valeur de l’option
    opt.value = codeCont;
    opt.textContent = `${codeCont} — Vol (plus de 4 produits) : ${volPlus4.toLocaleString("fr-FR", { minimumFractionDigits: 1 })} m³, Poids max : ${poidsMax.toLocaleString("fr-FR")} kg`;
    // On stocke en data-* les informations qui nous serviront pour le calcul
    opt.dataset.volumeMax = volPlus4;
    opt.dataset.poidsMax = poidsMax;
    // Si vous souhaitez afficher ou utiliser le coût plus tard :
    opt.dataset.cout = cont["Cout_du_conteneur"];
    select.appendChild(opt);
  });
}

/**
 * 4. Quand l’utilisateur clique sur “Calculer l’adéquation”
 */
function traiterCalcul() {
  // 4.1. Calculer le poids total et le volume total selon les quantités
  let poidsTotal = 0;
  let volumeTotal = 0;

  produits.forEach((prod, index) => {
    const inputQt = document.getElementById(`quantite-${index}`);
    const qt = parseInt(inputQt.value, 10) || 0;
    poidsTotal += qt * parseFloat(prod["Poids_unité"]);
    volumeTotal += qt * parseFloat(prod["Volume_unité"]);
  });
  // Arrondir pour l’affichage
  poidsTotal = Math.round(poidsTotal * 1000) / 1000;
  volumeTotal = Math.round(volumeTotal * 1000000) / 1000000; 
  // (6 décimales pour mieux voir les petits volumes)

  // 4.2. Récupérer le conteneur sélectionné dans le <select>
  const select = document.getElementById("select-conteneur");
  const codeSel = select.value;
  if (!codeSel) {
    afficherMessage({
      type: "erreur",
      html: "Veuillez sélectionner un conteneur avant de lancer le calcul."
    });
    return;
  }

  const optionSel = select.selectedOptions[0];
  const volMax = parseFloat(optionSel.dataset.volumeMax);
  const poidsMax = parseFloat(optionSel.dataset.poidsMax);

  // 4.3. Vérifier si le conteneur sélectionné est trop petit (volume ou poids)
  let estTropPetit = false;
  let manqueVol = 0;
  let manquePoids = 0;

  if (volumeTotal > volMax) {
    estTropPetit = true;
    manqueVol = Math.round((volumeTotal - volMax) * 1000000) / 1000000;
  }
  if (poidsTotal > poidsMax) {
    estTropPetit = true;
    manquePoids = Math.round((poidsTotal - poidsMax) * 1000) / 1000;
  }

  // 4.4. Trouver le “meilleur” conteneur (celui avec le plus petit volMax ≥ volumeTotal ET poidsMax ≥ poidsTotal)
  const candidats = conteneurs.filter((cont) => {
    const capVol = parseFloat(cont["Capacite_plus_de_quatre"]);
    const capPds = parseFloat(cont["Poids_max"]);
    return capVol >= volumeTotal && capPds >= poidsTotal;
  });

  let meilleur = null;
  if (candidats.length > 0) {
    candidats.sort((a, b) => {
      const volA = parseFloat(a["Capacite_plus_de_quatre"]);
      const volB = parseFloat(b["Capacite_plus_de_quatre"]);
      if (volA !== volB) return volA - volB;
      const pA = parseFloat(a["Poids_max"]);
      const pB = parseFloat(b["Poids_max"]);
      return pA - pB;
    });
    meilleur = candidats[0];
  }

  // 4.5. Construire le message de retour
  let html = "";
  let cssClasse = "";

  if (estTropPetit) {
    //  → Conteneur choisi trop petit
    cssClasse = "trop-petit";
    html += `<p>❌ <strong>Ce conteneur (<code>${codeSel}</code>) est trop petit pour votre commande.</strong></p>`;
    if (manqueVol > 0) {
      html += `<p>Il vous manque <strong>${manqueVol.toLocaleString("fr-FR", { minimumFractionDigits: 6 })} m³</strong> de volume.</p>`;
    }
    if (manquePoids > 0) {
      html += `<p>Il vous manque <strong>${manquePoids.toLocaleString("fr-FR", { minimumFractionDigits: 3 })} kg</strong> de capacité poids.</p>`;
    }
    if (meilleur) {
      const meilleurCode = meilleur["NAME "].trim();
      const meilleurVol = parseFloat(meilleur["Capacite_plus_de_quatre"]);
      const meilleurPds = parseFloat(meilleur["Poids_max"]);
      html += `<p>🔍 Vous devriez envisager le conteneur : <strong>${meilleurCode}</strong> (Vol : ${meilleurVol.toLocaleString("fr-FR", { minimumFractionDigits: 1 })} m³, Poids max : ${meilleurPds.toLocaleString("fr-FR")} kg).</p>`;
    } else {
      html += `<p>⚠️ Aucun conteneur disponible n’est assez grand pour contenir votre commande (Vol requis : ${volumeTotal.toLocaleString("fr-FR", { minimumFractionDigits: 6 })} m³, Poids requis : ${poidsTotal.toLocaleString("fr-FR", { minimumFractionDigits: 3 })} kg).</p>`;
    }
  } else {
    //  → Conteneur choisi suffit en volume et poids
    const espaceRestantVol = Math.round((volMax - volumeTotal) * 1000000) / 1000000;
    const espaceRestantPoids = Math.round((poidsMax - poidsTotal) * 1000) / 1000;

    if (meilleur && meilleur["NAME "].trim() !== codeSel) {
      // Un autre conteneur plus petit pourrait suffire
      cssClasse = "trop-grand";
      const meilleurCode = meilleur["NAME "].trim();
      html += `<p>⚠️ Votre conteneur (<code>${codeSel}</code>) peut contenir la commande, mais le conteneur <strong>${meilleurCode}</strong> serait plus adapté (moins d’espace gaspillé).</p>`;
      html += `<p>• <strong>Espace restant</strong> dans votre conteneur actuel : ${espaceRestantVol.toLocaleString("fr-FR", { minimumFractionDigits: 6 })} m³ et ${espaceRestantPoids.toLocaleString("fr-FR", { minimumFractionDigits: 3 })} kg.</p>`;
    } else {
      // Soit c’est déjà le conteneur le plus petit suffisamment grand, soit aucun autre conteneur ne peut contenir mieux
      cssClasse = "adapte";
      html += `<p>✅ <strong>Le conteneur <code>${codeSel}</code> est bien adapté à votre commande.</strong></p>`;
      html += `<p>• Espace restant : ${espaceRestantVol.toLocaleString("fr-FR", { minimumFractionDigits: 6 })} m³ et ${espaceRestantPoids.toLocaleString("fr-FR", { minimumFractionDigits: 3 })} kg.</p>`;
    }
  }

  afficherMessage({ type: cssClasse, html });
}

/**
 * 5. Afficher le message dans #message-resultat
 *    - type : “adapte”, “trop-petit”, “trop-grand” ou “erreur”
 *    - html : contenu HTML déjà formaté
 */
function afficherMessage({ type, html }) {
  const zone = document.getElementById("message-resultat");
  zone.innerHTML = "";
  zone.className = ""; // retire les anciennes classes

  const div = document.createElement("div");
  div.classList.add("message");
  if (type === "adapte")      div.classList.add("adapte");
  else if (type === "trop-petit") div.classList.add("trop-petit");
  else if (type === "trop-grand") div.classList.add("trop-grand");
  else if (type === "erreur") {
    // en cas d’erreur (ex. pas de conteneur choisi)
    div.style.backgroundColor = "#f8d7da";
    div.style.color = "#721c24";
    div.style.border = "1px solid #f5c6cb";
  }
  div.innerHTML = html;
  zone.appendChild(div);
}
