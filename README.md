# Compressify

Compressify é um aplicativo desktop para comprimir fotos individuais ou diretórios inteiros com uma interface moderna, rápida e local.

**Autor:** Igor Ferreira

## Recursos

- Seleção de uma foto específica ou de uma pasta completa.
- Compressão automática ou por meta de tamanho: 5 MB, 10 MB, 50 MB ou valor personalizado.
- Formatos de saída: inteligente, manter formato, JPG, WebP, AVIF e PNG.
- Validações de origem, destino, formatos suportados e limites de tamanho.
- Prévia de economia total, itens processados, falhas e relatório por arquivo.
- Processamento local com Electron e Sharp, sem upload para servidores.

## Stack

- Electron
- React
- TypeScript
- Vite / electron-vite
- Sharp
- Lucide React

## Como rodar

```bash
npm install
npm run dev
```

Se o npm da máquina estiver apontando para um registry privado, use:

```bash
npm install --registry=https://registry.npmjs.org/
```

## Gerar versão portátil para Windows

```bash
npm run dist
```

O executável portátil será criado em `release/`.

Nesta entrega, o portátil já foi gerado em `release/Compressify-1.0.0-x64.exe`.

## Como usar

1. Escolha se deseja comprimir um arquivo ou uma pasta.
2. Selecione a origem.
3. Escolha a pasta de saída ou use a pasta sugerida.
4. Selecione o modo de compressão.
5. Clique em **Comprimir fotos**.

## Formatos suportados

Entrada: JPG, JPEG, PNG, WebP, AVIF e TIFF.

Saída: JPG, PNG, WebP ou AVIF, de acordo com a opção escolhida.

## Observações

- O app cria novos arquivos na pasta de saída e não sobrescreve as imagens originais.
- Em metas de tamanho muito agressivas, alguns arquivos podem chegar ao menor tamanho possível sem bater exatamente a meta.
- Diretórios são processados de forma recursiva, preservando a estrutura relativa das pastas.
