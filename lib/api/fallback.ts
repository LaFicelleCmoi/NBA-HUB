import "server-only";

/**
 * Dernier résultat valide de chaque source, conservé en mémoire.
 *
 * Quand l'API amont tombe (réseau coupé, ESPN qui ne répond plus, délai
 * dépassé), la page affichait « Données momentanément indisponibles » et
 * l'utilisateur se retrouvait devant un écran vide alors que les données
 * avaient déjà été chargées quelques minutes plus tôt. On ressert donc la
 * dernière valeur connue : un classement d'il y a dix minutes vaut mieux
 * qu'une page d'erreur.
 *
 * Le cache vit dans le processus : il repart de zéro à chaque redémarrage et
 * n'est pas partagé entre instances. C'est un filet de sécurité d'affichage,
 * pas une source de vérité — le cache de données de Next reste la couche
 * normale de mise en cache.
 */
const lastGood = new Map<string, { value: unknown; at: number }>();

/** Au-delà, on préfère l'erreur franche à une donnée trompeuse. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function withFallback<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const value = await fn();
    lastGood.set(key, { value, at: Date.now() });
    return value;
  } catch (err) {
    const cached = lastGood.get(key);
    if (!cached || Date.now() - cached.at > MAX_AGE_MS) throw err;
    const age = Math.round((Date.now() - cached.at) / 1000);
    console.warn(
      `[repli] ${key} : amont indisponible (${err instanceof Error ? err.message : "erreur inconnue"}), ` +
        `réponse servie depuis le dernier résultat valide (${age} s).`,
    );
    return cached.value as T;
  }
}
