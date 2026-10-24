// Aislamiento de los visitantes: nombres de las listas de direcciones del router y de las reglas que las usan.
// El portal mantiene `visitantes` (perfil del Hotspot) y `equipos-fijos` (IP de los equipos fijos); el resto lo trae el script del router.

/** Los usuarios del perfil de menor privilegio entran aquí al iniciar sesión (`address-list` del perfil del Hotspot). */
export const VISITOR_LIST = "visitantes";
/** IP actuales de los equipos fijos registrados en el portal. */
export const FIXED_LIST = "equipos-fijos";
/** Redes privadas a las que un visitante no debe llegar (otras redes del local). */
export const PRIVATE_LIST = "redes-privadas";
/** Marca de las entradas que crea el portal en `equipos-fijos`: solo esas se tocan. */
export const LIST_COMMENT_PREFIX = "Portal:";
