# Quiniela Mundialista 2026

Web lista para publicar en GitHub Pages y conectar con Firebase.

## Incluye
- Registro e ingreso por correo.
- Pestaña de reglas.
- Pestaña Mi quiniela.
- Pestaña Resultados oficiales.
- Pestaña Tabla diaria.
- Ranking general.
- Panel Admin para registrar resultados.
- Bloqueo de pronósticos cuando ya existe resultado final.

## Instalación rápida
1. Crea un proyecto en Firebase.
2. Activa Authentication > Email/Password.
3. Activa Firestore Database.
4. Copia `firebase-config.example.js` como `firebase-config.js`.
5. Coloca tu configuración Firebase.
6. Cambia `ADMIN_EMAILS` en `firebase-config.js`.
7. Cambia el correo administrador en `firestore.rules`.
8. Publica las reglas en Firebase.
9. Sube estos archivos a GitHub.
10. En GitHub: Settings > Pages > Deploy from branch > main > root.
11. En tu dominio: crea CNAME apuntando a `TUUSUARIO.github.io` y agrega el dominio en GitHub Pages.

## Reglas sugeridas
- Marcador exacto: 5 puntos.
- Resultado correcto: 3 puntos.
- Diferencia de goles correcta: 1 punto extra.
- Una vez ingresado el resultado oficial, el pronóstico queda bloqueado.

## Cargar todos los partidos
Edita `matches.js` y agrega los 104 partidos del Mundial 2026 con este formato:

```js
{ id:"M007", date:"2026-06-13", time:"14:00", group:"C", home:"Equipo 1", away:"Equipo 2", venue:"Sede" }
```
