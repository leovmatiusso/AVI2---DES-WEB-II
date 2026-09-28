const express = require("express");
const app = express();
app.use(express.json());

let ordens = [];

const TIPOS_VALIDOS = [1, 2, 3];
const NOME_TIPO = { 1: "padrao", 2: "premium", 3: "sobEncomenda" };

function tipoValido(tipo) {
  for (let i = 0; i < TIPOS_VALIDOS.length; i++) {
    if (TIPOS_VALIDOS[i] === tipo) return true;
  }
  return false;
}

function ajustarCusto(custoBase, tipo) {
  switch (tipo) {
    case 1: return custoBase;
    case 2: return custoBase * 1.1;
    case 3: return custoBase * 1.2;
    default: return null;
  }
}

function calcularAlerta(estoqueFinal) {
  if (estoqueFinal > 5000) return "ALTO";
  if (estoqueFinal < 500) return "CRITICO";
  return "NORMAL";
}

function recalcular(o) {
  o.estoqueFinal = o.estoqueInicial + o.quantidadeProduzida;
  o.custoUnitarioAjustado = Number(ajustarCusto(o.custoUnitarioBase, o.tipoProduto).toFixed(2));
  o.custoTotal = Number((o.quantidadeProduzida * o.custoUnitarioAjustado).toFixed(2));
  o.alertaEstoque = calcularAlerta(o.estoqueFinal);
  return o;
}

const ehNumero = (v) => typeof v === "number" && Number.isFinite(v);

function validar(dados, parcial = false) {
  const erros = [];
  const campos = ["codigoProduto", "tipoProduto", "quantidadeProduzida", "custoUnitarioBase", "estoqueInicial"];

  if (!parcial) {
    for (const c of ["codigoOrdem", ...campos]) {
      if (dados[c] === undefined || dados[c] === null || dados[c] === "") erros.push(`Campo obrigatório: ${c}`);
    }
  }
  if (dados.codigoProduto !== undefined && (typeof dados.codigoProduto !== "string" || !dados.codigoProduto.trim()))
    erros.push("codigoProduto deve ser uma string não vazia");
  if (dados.tipoProduto !== undefined && !tipoValido(dados.tipoProduto))
    erros.push("tipoProduto deve ser 1 (Padrão), 2 (Premium) ou 3 (Sob encomenda)");
  for (const c of ["quantidadeProduzida", "custoUnitarioBase", "estoqueInicial"]) {
    if (dados[c] !== undefined && (!ehNumero(dados[c]) || dados[c] < 0)) erros.push(`${c} deve ser um número >= 0`);
  }
  return erros;
}

const buscar = (codigo) => ordens.find((o) => String(o.codigoOrdem) === String(codigo));


app.post("/ordens", (req, res) => {
  const d = req.body || {};
  const erros = validar(d);
  if (erros.length) return res.status(400).json({ erros });
  if (buscar(d.codigoOrdem)) return res.status(400).json({ erro: "codigoOrdem já cadastrado" });

  const ordem = recalcular({
    codigoOrdem: d.codigoOrdem,
    codigoProduto: d.codigoProduto.trim(),
    tipoProduto: d.tipoProduto,
    quantidadeProduzida: d.quantidadeProduzida,
    custoUnitarioBase: d.custoUnitarioBase,
    estoqueInicial: d.estoqueInicial,
  });
  ordens.push(ordem);
  res.status(201).json(ordem);
});

app.get("/ordens", (req, res) => {
  let resultado = ordens;
  if (req.query.tipo !== undefined) {
    resultado = resultado.filter((o) => o.tipoProduto === Number(req.query.tipo));
  }
  if (req.query.alerta !== undefined) {
    const a = String(req.query.alerta).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    resultado = resultado.filter((o) => o.alertaEstoque === a);
  }
  res.json(resultado);
});

app.get("/ordens/:codigoOrdem", (req, res) => {
  const ordem = buscar(req.params.codigoOrdem);
  if (!ordem) return res.status(404).json({ erro: "Ordem não encontrada" });
  res.json(ordem);
});

app.put("/ordens/:codigoOrdem", (req, res) => {
  const ordem = buscar(req.params.codigoOrdem);
  if (!ordem) return res.status(404).json({ erro: "Ordem não encontrada" });

  const d = req.body || {};
  const erros = validar(d, true);
  if (erros.length) return res.status(400).json({ erros });

  for (const c of ["codigoProduto", "tipoProduto", "quantidadeProduzida", "custoUnitarioBase", "estoqueInicial"]) {
    if (d[c] !== undefined) ordem[c] = c === "codigoProduto" ? d[c].trim() : d[c];
  }
  recalcular(ordem);
  res.json(ordem);
});

app.delete("/ordens/:codigoOrdem", (req, res) => {
  const idx = ordens.findIndex((o) => String(o.codigoOrdem) === String(req.params.codigoOrdem));
  if (idx === -1) return res.status(404).json({ erro: "Ordem não encontrada" });
  ordens.splice(idx, 1);
  res.json({ mensagem: "Ordem removida com sucesso" });
});


function gerarRelatorio() {
  const rel = {
    totalOrdens: ordens.length,
    estoquePorTipo: { padrao: 0, premium: 0, sobEncomenda: 0 },
    mediaCustoTotalPorOrdem: 0,
    ordemMaisCara: null,
    ordemMaisBarata: null,
    quantidadeAlertas: { alto: 0, critico: 0, normal: 0 },
    porProduto: {},
  };
  if (!ordens.length) return rel;

  let somaCusto = 0;
  let maisCara = ordens[0];
  let maisBarata = ordens[0];

  for (const o of ordens) {
    rel.estoquePorTipo[NOME_TIPO[o.tipoProduto]] += o.estoqueFinal;
    somaCusto += o.custoTotal;
    if (o.custoTotal > maisCara.custoTotal) maisCara = o;
    if (o.custoTotal < maisBarata.custoTotal) maisBarata = o;
    rel.quantidadeAlertas[o.alertaEstoque.toLowerCase()]++;

    if (!rel.porProduto[o.codigoProduto])
      rel.porProduto[o.codigoProduto] = { estoqueFinalConsolidado: 0, valorTotalInvestido: 0 };
    rel.porProduto[o.codigoProduto].estoqueFinalConsolidado += o.estoqueFinal;
    rel.porProduto[o.codigoProduto].valorTotalInvestido += o.custoTotal;
  }

  rel.mediaCustoTotalPorOrdem = Number((somaCusto / ordens.length).toFixed(2));
  rel.ordemMaisCara = { codigoOrdem: maisCara.codigoOrdem, custoTotal: maisCara.custoTotal };
  rel.ordemMaisBarata = { codigoOrdem: maisBarata.codigoOrdem, custoTotal: maisBarata.custoTotal };
  for (const p of Object.values(rel.porProduto)) p.valorTotalInvestido = Number(p.valorTotalInvestido.toFixed(2));
  return rel;
}

app.get("/relatorios/ordens", (req, res) => res.json(gerarRelatorio()));


app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ erro: "JSON inválido" });
  res.status(500).json({ erro: "Erro interno" });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
module.exports = app;