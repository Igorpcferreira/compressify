# Desvios do brand board

O [brand board](./Compressify%20Brand%20Board.dc.html) é a fonte de verdade do design
system. Este arquivo registra **todo ponto em que o código se afasta dele**, com o
motivo e o número que sustenta a decisão.

A regra: se algo no código não bate com o board e não está listado aqui, é bug.

---

## 1. Emendas de contraste (WCAG AA)

Quatro pares de cores que o board efetivamente usa reprovam no WCAG AA. Como o critério
de aceite da Fase 1 exige Lighthouse ≥ 90 em Acessibilidade e o brief classifica
acessibilidade como não-opcional, os quatro foram corrigidos com a menor alteração
capaz de passar.

Razões calculadas pela fórmula de luminância relativa da WCAG 2.1. Mínimo para texto
normal: 4,5:1. Para elementos não-textuais (bordas, ícones): 3:1.

### 1.1 Texto sobre Signal

| | Cor | Contraste sobre `#00D47E` | Situação |
|---|---|---|---|
| Board | `#04624A` (Signal Deep) | **3,76:1** | ❌ reprova |
| Código | `#023B2C` (`--color-on-signal`) | **6,44:1** | ✅ passa |

Afeta o **botão primário** (15px/600) e o **badge de redução** `−86%` (13px/700) — os
dois componentes mais visíveis do produto. Nenhum dos dois se qualifica como "texto
grande" pela WCAG (que exige ≥ 18,66px em negrito ou ≥ 24px), então o mínimo é 4,5:1.

Considerei usar Ink `#0B0D0C` (9,95:1), mas `#023B2C` **mantém o texto verde**, que é a
leitura de marca do board. Signal Deep continua existindo como token e continua correto
onde o board o usa fora do botão — sobre branco ele dá 7,37:1.

### 1.2 Texto secundário no modo escuro

| | Cor | Sobre Ink `#0B0D0C` | Sobre Graphite `#1A1D1B` | Situação |
|---|---|---|---|---|
| Board | `#6B716D` (Slate) | **3,91:1** | **3,41:1** | ❌ reprova |
| Código | `#8A908C` (`--color-slate-dark`) | **5,99:1** | **5,22:1** | ✅ passa |

O board usa Slate para praticamente todo o texto secundário do mockup escuro: links da
navegação, subtítulo do hero, `3 ARQUIVOS · 2 CONCLUÍDOS` e os tamanhos de arquivo.

**Slate permanece inalterado no modo claro**, onde passa: 4,68:1 sobre Paper e 4,99:1
sobre White. O token novo é exclusivo do tema escuro.

### 1.3 Mensagem de erro sobre superfície clara

| | Cor | Sobre `#FFFFFF` | Situação |
|---|---|---|---|
| Board | `#FF4D4D` | **3,27:1** | ❌ reprova como texto |
| Código | `#D93030` (`--color-error-text`) | **4,54:1** | ✅ passa |

**`#FF4D4D` não muda** e continua sendo a cor de erro para **borda e ícone** — 3,27:1
satisfaz o mínimo de 3:1 da WCAG 1.4.11 para elementos não-textuais. A troca vale só
para o texto da mensagem, como em "Codec ProRes não suportado pelo navegador".

Sobre Ink, `#FF4D4D` dá 5,96:1 e passa também como texto — no modo escuro nada muda.

---

## 2. Acréscimos ao board

Coisas que o produto precisa e o board não define.

### 2.1 Ícones sem equivalente no lucide

O board traz oito ícones autorais em grid de 24px com traço de 1,5px. Cinco existem no
lucide-react; três não: **comprimir**, **converter** e **PDF**. Esses três entram como
componentes próprios em `src/components/icons/`, transcritos do board.

Não é misturar família de ícones — é completar a que já existe, mantendo grid e traço.

### 2.2 Tokens de tema

O board é um documento estático e mostra os dois temas lado a lado; ele não define como
uma cor "vira" a outra. O código introduz uma camada semântica
(`--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`,
`--color-text-muted`) que resolve por tema. Os valores são exatamente os do board:

| Papel | Claro | Escuro |
|---|---|---|
| `surface` | Paper `#F7F8F5` | Ink `#0B0D0C` |
| `surface-raised` | White `#FFFFFF` | Graphite `#1A1D1B` |
| `border` | Line `#E3E6E2` | Graphite `#1A1D1B` |
| `text` | Ink `#0B0D0C` | White `#FFFFFF` |
| `text-muted` | Slate `#6B716D` | `#8A908C` (emenda 1.2) |

Nota: no tema escuro o board não tem token de borda separado — a borda **é** o Graphite,
o mesmo valor da superfície elevada. Foi transcrito assim, de propósito.

### 2.3 Tracking por nível

O brief citava `letter-spacing: -0.035em` para a família Display inteira. O board usa
valores distintos por tamanho, e o código segue o board:

| Nível | Tracking |
|---|---|
| Display 56px | −0,04em |
| H1 40px | −0,035em |
| H2 28px | −0,025em |
| H3 20px (Inter) | −0,01em |
| Caption 12px | +0,02em |
| Eyebrow 11px | +0,14em |

---

## 3. O que não foi alterado

Para deixar explícito o que **não** é desvio:

- Toda a paleta de neutros, o Signal, o Ember e as cores de estado — valores idênticos.
- As três famílias tipográficas e seus pesos.
- O símbolo do logo, incluindo a regra de escala (traço sobe para 4/32 abaixo de 24px,
  nunca renderizar abaixo de 16px).
- Raios, alturas de controle e espessuras, todos medidos diretamente no board.
- Ember segue limitado a **um uso por tela**.
- Signal segue **proibido** em texto pequeno sobre branco (1,96:1).
