# Tela Compartilhada

Site para compartilhar a tela do computador (com vídeo e áudio) em salas de
até 10 pessoas, em tempo real, direto pelo navegador. Sem precisar instalar
nada — quem for assistir só precisa do link.

Este guia foi escrito para quem **nunca hospedou um site antes**. Vai levar
uns 10-15 minutos.

---

## O que você vai fazer

1. Criar uma conta no GitHub (guarda os arquivos do site)
2. Subir os arquivos deste projeto para lá
3. Criar uma conta no Render (coloca o site no ar, de graça)
4. Conectar o Render ao GitHub e publicar
5. Pronto: você terá um link (tipo `https://seu-site.onrender.com`) para
   mandar para qualquer pessoa

Não precisa saber programar nem usar terminal/linha de comando — dá para
fazer tudo pelo navegador.

---

## Passo 1 — Criar conta no GitHub

O GitHub é onde os arquivos do site vão ficar guardados (o Render busca o
site lá).

1. Acesse **https://github.com** e clique em **Sign up**
2. Crie a conta com seu e-mail (é grátis)

---

## Passo 2 — Criar um repositório e subir os arquivos

1. Depois de logado, clique no **+** no canto superior direito → **New repository**
2. Dê um nome, por exemplo `tela-compartilhada`
3. Deixe marcado como **Private** (só você acessa os arquivos; o site em si
   vai ficar público do mesmo jeito) ou **Public**, tanto faz
4. Clique em **Create repository**
5. Na página que abrir, procure o link **"uploading an existing file"**
   (ou vá em **Add file → Upload files**)
6. Agora arraste para lá **todos os arquivos e pastas desta pasta do
   projeto** (`server.js`, `package.json`, `README.md` e a pasta `public`
   inteira com tudo dentro)
7. Role para baixo e clique em **Commit changes** (o botão verde) para
   confirmar o envio

> Dica: se o site pedir para arrastar a pasta `public` e não funcionar
> direto, arraste o conteúdo de dentro dela mantendo a estrutura — o
> GitHub recria as pastas automaticamente quando você arrasta uma pasta
> inteira do Windows.

---

## Passo 3 — Criar conta no Render

O Render é quem vai efetivamente "ligar" o site e te dar o link público,
com HTTPS (obrigatório para o compartilhamento de tela funcionar).

1. Acesse **https://render.com** e clique em **Get Started**
2. Crie a conta — o mais fácil é clicar em **"Sign up with GitHub"**, assim
   já fica tudo conectado

---

## Passo 4 — Publicar o site

1. No painel do Render, clique em **New +** → **Web Service**
2. Selecione o repositório que você criou (`tela-compartilhada`). Se ele não
   aparecer, clique em **Configure account** e dê permissão ao Render para
   ver esse repositório
3. Preencha:
   - **Name**: o nome que você quiser (vira parte do link, ex: `sala-da-equipe`)
   - **Region**: qualquer uma (de preferência a mais próxima do Brasil, ex:
     Oregon ou Ohio — o Render não tem região no Brasil ainda)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
4. Clique em **Create Web Service**

O Render vai instalar tudo e ligar o site sozinho — acompanhe o log na
tela, quando aparecer algo como `Servidor rodando na porta...` está pronto.

5. No topo da página vai aparecer o link do site, algo como:
   `https://sala-da-equipe.onrender.com`

Esse é o link que você compartilha com as pessoas.

> **Plano grátis do Render**: se o site ficar 15 minutos sem ninguém
> acessando, ele "dorme" e demora uns 30-50 segundos para acordar na
> próxima vez que alguém abrir o link. É normal, só esperar carregar.

---

## Como usar o site

1. Abra o link e digite seu nome e um "código de sala" (qualquer palavra,
   ex: `equipe-01`) — quem usar o mesmo código cai na mesma sala
2. Compartilhe esse mesmo link + código com as outras pessoas
3. Qualquer um na sala pode clicar em **"Compartilhar minha tela"**
4. Até 10 pessoas por sala

---

## Se você quiser atualizar o site depois

Sempre que precisar mudar algo:

1. Edite os arquivos aqui na pasta do projeto
2. Vá no repositório no GitHub → **Add file → Upload files** → suba os
   arquivos alterados de novo → **Commit changes**
3. O Render detecta a mudança sozinho e atualiza o site automaticamente em
   1-2 minutos (dá para acompanhar em **Events** ou **Logs** no painel do
   Render)

---

## Limitações importantes (para saber de antemão)

- **Sem gravação, sem chat de texto, sem senha/login** — é a versão simples,
  focada em só compartilhar a tela
- **Áudio**: em alguns sistemas (principalmente Mac), o navegador só deixa
  capturar o áudio de uma aba do Chrome, não da tela/sistema inteiro — isso
  é uma limitação do navegador, não do site
- **Sem persistência**: se o Render reiniciar o serviço (ou ele "dormir" no
  plano grátis), as salas ativas se perdem e as pessoas precisam entrar de
  novo
- **Rede simples**: com muitas pessoas compartilhando ao mesmo tempo numa
  sala cheia, a internet de quem compartilha pode pesar um pouco — para
  grupos de até 5-6 pessoas funciona bem

---

## Testando no seu próprio computador antes de publicar (opcional)

Se você quiser testar antes de subir para o GitHub, e tiver o
[Node.js](https://nodejs.org) instalado:

```bash
cd tela-compartilhada
npm install
npm start
```

Depois abra `http://localhost:3000` no navegador.
