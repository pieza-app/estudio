# Cambios · Changelog

Lo que cambia para quien usa Pieza, en palabras simples. Las descargas de cada versión están en
[Releases](https://github.com/pieza-app/estudio/releases).
*What changes for people using Pieza, in plain words. Downloads for each version are in Releases.*

## Sin publicar · Unreleased
<!-- Una línea por cambio que se nota, en lenguaje de persona («Ahora puedes…»), en español · *e inglés*. Al publicar una
versión (subir «version» en app.json), estas líneas pasan a «## X.Y.Z». -->

## 0.13.0
- Un paso en curso muestra sus etapas (prepara, lee tu código, escribe, revisa los cambios, prueba), qué hace en este momento, cuántos archivos leyó y escribió y cuántos tokens lleva. Si las pruebas fallan, ves qué falló mientras tu IA lo arregla. · *A running step shows its stages (prepare, read your code, write, check the changes, test), what it's doing right now, how many files it read and wrote, and how many tokens it has used. If the tests fail, you see what failed while your AI fixes it.*
- Pieza encuentra Rust instalado con rustup y ya no lo instala de nuevo. Antes de instalar algo, revisa otra vez si ya lo tienes. · *Pieza finds Rust installed with rustup and no longer installs it again. Before installing anything, it checks again whether you already have it.*
- El panel de la derecha ya no tapa la lista de pasos en ventanas medianas. · *The right panel no longer covers the list of steps in medium-size windows.*

## 0.12.1
- Piezas al día: las piezas nuevas o arregladas de Pieza ya se pueden usar al crear una app. · *Pieces up to date: new or fixed Pieza pieces can now be used when creating an app.*
- Al publicar, Pieza avisa que Windows y Linux van en beta y qué verá quien abra tu app por primera vez (el aviso de Windows y la confirmación de Mac). · *When publishing, Pieza says that Windows and Linux are in beta and what people see the first time they open your app (the Windows warning and the Mac confirmation).*

## 0.12.0
- Después de publicar tu app puedes pedirle un cambio (Pieza arma un plan solo para eso, lo revisa y lo corrige antes de construir) y publicar una versión nueva con un toque: sube el número, revisa otra vez que no haya secretos ni datos personales y quien la instaló la recibe sola. · *After publishing your app you can ask for a change (Pieza makes a plan just for that, reviews and fixes it before building) and publish a new version with one tap: it raises the number, checks again for secrets and personal data, and people who installed it get it automatically.*

## 0.12.0
- Después de publicar tu app puedes pedirle un cambio (Pieza arma un plan solo para eso, lo revisa y lo corrige antes de construir) y publicar una versión nueva con un toque: sube el número, revisa otra vez que no haya secretos ni datos personales y quien la instaló la recibe sola. · *After publishing your app you can ask for a change (Pieza makes a plan just for that, reviews and fixes it before building) and publish a new version with one tap: it raises the number, checks again for secrets and personal data, and people who installed it get it automatically.*

## 0.11.0
- Más seguro y más claro: las pruebas del código que escribe tu IA corren aisladas (sin internet ni acceso a tus llaves), y antes de publicar ves qué se sube, si hay secretos o datos personales y qué hace tu app. Pieza muestra dónde se construye tu app y con qué tecnologías, revisa lo que tu computador necesita (Git, Node, Rust, GitHub CLI) e instala lo que falta. Eliminar una app borra también su carpeta local (nunca el repo de GitHub). · *Safer and clearer: tests of the code your AI writes run isolated (no internet or access to your keys), and before publishing you see what's uploaded, whether there are secrets or personal data, and what your app does. Pieza shows where your app is built and with which technologies, checks what your computer needs (Git, Node, Rust, GitHub CLI) and installs what's missing. Deleting an app also deletes its local folder (never the GitHub repo).*

## 0.10.0
- El plan se mejora solo: tu IA lo arma, tres revisores lo leen a ciegas y Pieza aplica lo grave e importante. Lo ves en tres etapas y al final sabes qué se corrigió. Cada pantalla dice arriba qué hacer ahora, los textos son más grandes, el tope de tokens vale también paso a paso, y un paso que gasta más de 3 veces lo estimado se detiene y te pregunta. · *The plan improves itself: your AI makes it, three reviewers read it blind and Pieza applies what's serious and important. You see it in three stages and at the end you know what was fixed. Every screen says at the top what to do now, text is bigger, the token limit also applies step by step, and a step that uses more than 3 times its estimate stops and asks you.*

## 0.9.0
- Publicar es su propia etapa, guiada: Pieza instala GitHub CLI, lo conecta con un código que pegas en GitHub (sin terminal), te ayuda a elegir tu cuenta o crear una organización, y al publicar te deja la página y las descargas a un toque. Un paso ya no queda fallando porque «acciones.json no está al día»: Pieza lo arma siempre antes de las pruebas. · *Publishing is its own guided stage: Pieza installs GitHub CLI, connects it with a code you paste on GitHub (no terminal), helps you pick your account or create an organization, and after publishing gives you the page and downloads one tap away. A step no longer keeps failing with “acciones.json is out of date”: Pieza always builds it before the tests.*

## 0.8.3
- En «Paso a paso», cuando hay pasos que no dependen entre sí, puedes hacerlos a la vez («Hacer los pasos 4, 5 a la vez»). El panel de control ya no queda cortado en ventanas angostas. · *In “Step by step”, when some steps don't depend on each other, you can do them at once (“Do steps 4, 5 at once”). The control panel no longer gets cut off in narrow windows.*

## 0.8.2
- Una copia o un respaldo en la carpeta de tus apps ya no aparece como otra app con el mismo nombre. · *A copy or backup in your apps folder no longer shows up as another app with the same name.*

## 0.8.1
- Los pasos del plan y de la construcción se ven en filas que se abren al tocarlas, sin un scroll gigante. Los botones, las cifras y el modo están en un panel de control a la derecha, siempre a la vista. En una app ya creada puedes revisar a ciegas, rehacer lo que falta (los pasos listos se quedan) e ir directo a construir. · *Plan and build steps are rows you tap to open, with no giant scroll. The buttons, numbers and mode are in a control panel on the right, always in view. In an app that's already created you can run the blind review, redo what's left (finished steps stay) and go straight to building.*

## 0.8.0
- Pieza desarrolla mejor tu app: el plan trae pasos más chicos que dicen qué deja listo cada uno y de cuáles dependen. Los pasos que no dependen entre sí se hacen a la vez. Un paso que no queda se divide en pasos más chicos (solo, en «Todo automático», o con «Dividirlo»). · *Pieza builds your app better: the plan has smaller steps that say what each one leaves ready and which ones they depend on. Steps that don't depend on each other run at the same time. A step that doesn't work is split into smaller steps (by itself in “Do it all”, or with “Split it”).*

## 0.7.2
- Cuando un paso no queda, Pieza te dice por qué, muestra todo lo que hizo tu IA y lo puedes arreglar o saltar ahí mismo. En «Todo automático» lo intenta arreglar sola una vez. Un paso que ya estaba hecho ya no falla por «no cambiaste ningún archivo». Los botones de los pasos quedan arriba, siempre a la vista. · *When a step doesn't work, Pieza tells you why, shows everything your AI did, and you can fix or skip it right there. In “Do it all” it tries to fix it once by itself. A step that was already done no longer fails with “you changed no file”. The step buttons stay at the top, always in view.*

## 0.7.1
- Pieza toma las piezas nuevas de la familia (tema 0.4.0 y componentes 0.4.0): los mismos colores, sin cambios que se noten. · *Pieza takes the family's new pieces (theme 0.4.0 and components 0.4.0): the same colors, no visible changes.*

## 0.7.0
- Pieza tiene un diseño nuevo: una barra lateral con tus apps, las etapas de cada app a la vista y, al lado de tu idea, las piezas que calzan en vivo. · *Pieza has a new design: a sidebar with your apps, the stages of each app in view and, next to your idea, the pieces that fit, live.*
- Ahora puedes escribir tu idea directo en el inicio y empezar desde ahí. · *You can now write your idea right on the home screen and start from there.*
- Ahora puedes quitar de la lista o borrar las apps que ya no quieres (menú «⋯»). · *You can now remove from the list or delete the apps you no longer want (the «⋯» menu).*
- Publicar en una organización nueva de GitHub es guiado: Pieza abre GitHub para crearla y sigue cuando le dices que está lista. · *Publishing to a new GitHub organization is guided: Pieza opens GitHub to create it and continues when you say it is ready.*

## 0.6.2
- Arreglado: las piezas ya hechas, como el servidor MCP, se pueden usar al crear una app (el catálogo de Pieza estaba desactualizado y ahora se pone al día solo cada día). · *Fixed: finished pieces, like the MCP server, can be used when creating an app (Pieza's catalog was out of date and now updates itself every day).*
- Arreglado: si marcas una pieza que todavía no existe (por ejemplo «Enviar comentarios»), crear la app ya no falla. Tu IA la escribe como parte del plan. · *Fixed: if you check a piece that does not exist yet (for example «Send feedback»), creating the app no longer fails. Your AI writes it as part of the plan.*

## 0.6.1
- La ventana ya no parpadea mientras Pieza se actualiza, y si la abriste desde Descargas te pide moverla a Aplicaciones para poder actualizar. · *The window no longer flickers while Pieza updates, and if you opened it from Downloads it asks you to move it to Applications so it can update.*

## 0.6.0
- Nueva «Revisión a ciegas»: tres sesiones nuevas de tu IA leen solo tu idea y el plan, buscan fallas (riesgos, uso y pasos) y tú eliges qué cambios entran al plan. · *New «Blind review»: three new sessions of your AI read only your idea and the plan, look for flaws (risks, use and steps), and you choose which changes go into the plan.*
- Ahora puedes darle a Pieza la idea completa de tu app (cómo funciona, reglas, pantallas y datos), no solo una frase. Va al plan y a cada paso. · *You can now give Pieza the full idea of your app (how it works, rules, screens and data), not just one sentence. It goes into the plan and every step.*
- Cada paso gasta menos: tu IA recibe un mapa de la app y lo que hicieron los pasos anteriores, y no lee lo que no sirve para programar. Con Claude o Codex ves los tokens reales, no una estimación. · *Each step spends less: your AI gets a map of the app and what earlier steps did, and does not read what is not useful for coding. With Claude or Codex you see the real tokens, not an estimate.*

## 0.5.0
- Ahora ves en vivo qué hace tu IA en cada paso (qué lee, qué escribe y cuánto lleva), y el plan arma pasos más chicos. Las versiones nuevas de Pieza vienen firmadas: la app no instala nada sin la firma. · *You now see live what your AI does in each step (what it reads, what it writes and how long it has taken), and the plan makes smaller steps. New Pieza versions are signed: the app installs nothing without the signature.*

## 0.4.0
- Ahora «Ver mi app» abre tu app en el navegador, sin terminal. Con Claude o Codex, tu IA edita la carpeta de tu app directamente (más rápido) y Pieza devuelve lo que no le toca. · *“See my app” now opens your app in the browser, no terminal needed. With Claude or Codex, your AI edits your app's folder directly (faster) and Pieza restores what it shouldn't touch.*

## 0.3.0
- Ahora puedes publicar tu app en GitHub con tu cuenta, sumarla al explorador de apps hechas con Pieza y proponer una pieza nueva. Las piezas también se ven en inglés. · *You can now publish your app on GitHub with your account, add it to the explorer of apps made with Pieza and propose a new piece. Pieces now show in English too.*

## 0.2.0
- Ahora Pieza crea tu app: tu IA arma el plan, Pieza crea la app con las piezas ya hechas y tu IA hace lo propio, paso a paso o todo automático, con los tokens a la vista. · *Pieza now builds your app: your AI makes the plan, Pieza builds the app with the ready-made pieces and your AI does the rest, step by step or fully automatic, with tokens in view.*

## 0.1.1
- Pieza ahora tiene el logo y los colores de Pieza, y su página es la de [Pieza](https://pieza-app.github.io/pieza/). · *Pieza now has the Pieza logo and colors, and its website is the [Pieza](https://pieza-app.github.io/pieza/) one.*

## 0.1.0
- Primera versión: eliges los sistemas, cuentas tu idea, eliges las piezas y ves la ficha de tu app. · *First version: choose the systems, tell your idea, pick the pieces and see your app's summary.*
