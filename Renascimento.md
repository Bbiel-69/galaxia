# MISSÃO: Restaurar a estética "Gargantua" do site galáxia interativa "Horizonte"

Você trabalha num site React + Vite + TanStack Router, com renderização 3D em Three.js/WebGL2. É uma galáxia navegável cujo centro é um buraco negro. Após correções de bugs, a estética original se perdeu — sua missão é reimplementá-la com fidelidade total à direção de arte abaixo, usando as imagens anexas como referência absoluta.

**Arquivos principais** (não criar estrutura nova, editar os existentes):
- `src/lib/galaxy/three-engine.ts` — motor Three.js
- `src/lib/galaxy/shaders.ts` — shaders GLSL
- `src/lib/galaxy/bodies.ts` — dados dos corpos celestes
- `src/lib/galaxy/audio.ts` — ambience via WebAudio (já tem `setFocus(id)`)
- `src/components/galaxy/galaxy-experience.tsx` — componente React

## 1. Buraco negro (elemento central)
Estilo Gargantua (Interestelar): esfera negra absoluta ao centro, envolta por disco de acreção branco-quente com tons rosados/lavanda/dourados, gradiente de intensidade (núcleo quase branco, bordas coloridas), textura de plasma fluido — nunca um anel uniforme.

Movimento: rotação Kepleriana lenta (interno mais rápido que externo), pulsação de brilho sutil (~6–10s), shimmer de ruído animado, lensing gravitacional opcional (descartar se custar FPS).

Deve ser o objeto visualmente dominante da cena.

## 2. Fundo galáctico
Camadas de profundidade: poeira cósmica, nebulosas procedurais (rosa/azul/violeta/âmbar, difusas, baixa saturação, bordas irregulares, sem formas geométricas), densidade estelar maior em espiral sutil ao redor do centro. Movimento mínimo: drift lentíssimo, parallax com a câmera, leve "respiro" das nebulosas — nunca competindo com o buraco negro.

## 3. Estrelas / pontos de luz
Brilhantes, com glow real (bloom/sprite radial, não pontos duros). Variedade de tamanho, cor (branco-azulado, branco, âmbar) e intensidade. Algumas com cross-flare ou halo. Espalhadas por todo o espaço navegável, todas clicáveis. Cintilação individual sutil (fases aleatórias). Hover: glow aumenta + cursor muda.

## 4. Fluxo de clique (crítico — nunca pular etapas)
1. Hover → feedback visual (glow, label);
2. Clique → câmera foca/zoom suavemente (~1–1.5s, easing cinematográfico) + áudio muda via `setFocus(id)`;
3. Só depois do foco completar → caixa glassmorphism aparece no canto inferior direito (fundo translúcido, blur, borda luminosa fina, cantos arredondados), por ora só com nome do corpo + botão "Visitar" apontando pro `href` em `bodies.ts`. Só esse botão abre o link;
4. Clicar em outro ponto/vazio → caixa fecha, ciclo reinicia;
5. Botão X fecha e retorna a câmera à posição anterior com a mesma fluidez.

## 5. Áudio
Drone ambiente contínuo (já existente). Crossfade suave ao focar (tom do corpo) e ao desfocar (volta ao padrão). Só síntese WebAudio, sem arquivos externos. Manter mute e a flag `horizonte-muted`.

## 6. Navegação
Pan por arrasto com inércia/damping, zoom com easing e limites com bounce sutil, todas as transições de câmera cinematográficas, respeitar `prefers-reduced-motion`, manter 60fps (reduzir partículas antes de sacrificar o bloom do buraco negro).

## Restrições
- Não adicionar dependências pesadas;
- Não quebrar `fallback.ts` nem a detecção de WebGL2;
- Manter `bodies.ts` editável;
- Manter responsividade mobile e painel acessível;
- Não remover funcionalidades existentes (tour, labels, cursor customizado) que não conflitem com o pedido.

## Critério de aceite
1. Buraco negro fiel às imagens, com rotação perceptível;
2. Fundo com nebulosas, camadas estelares, parallax e drift mínimos;
3. Estrelas brilhantes, espalhadas, cintilando;
4. Clique nunca abre link direto — sempre foca primeiro, depois mostra caixa vazia com botão;
5. Som muda suavemente ao focar;
6. Navegação com inércia, 60fps estáveis.
