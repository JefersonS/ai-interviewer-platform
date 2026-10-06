import type { Bank } from "./questions";

// Brazilian Portuguese version of QUESTION_BANK (same keys, same difficulty order).
export const QUESTION_BANK_PT: Bank = {
  "backend-engineer": {
    "API design": [
      "Para começar, como você descreveria os tipos de API que já construiu e quem as usava?",
      "Como você decide a estrutura de um endpoint e das respostas de erro?",
      "Como você lidaria com versionamento e compatibilidade com versões anteriores quando uma API já tem muitos clientes?",
      "Imagine que duas equipes precisam de mudanças conflitantes em uma API compartilhada. Como você resolveria isso e protegeria os consumidores atuais?",
    ],
    "databases and data modeling": [
      "Com quais bancos de dados você já trabalhou e do que gostou ou não gostou neles?",
      "Como você decide quais tabelas e índices criar para uma nova funcionalidade?",
      "Como você alteraria o esquema de uma tabela grande em produção sem tirar o sistema do ar?",
      "Quando você desnormalizaria ou dividiria um banco de dados, e como manteria a consistência depois?",
    ],
    "reliability and debugging in production": [
      "Como você costuma descobrir que algo está errado em produção?",
      "Pode me explicar como você depura um problema em produção, a partir do primeiro alerta?",
      "Como você projeta um serviço para que a falha de uma dependência não derrube todo o resto?",
      "Como você investigaria uma falha em produção difícil de reproduzir, com pouquíssimos dados?",
    ],
    "scaling and performance": [
      "Qual foi o sistema com mais tráfego em que você já trabalhou, em termos simples?",
      "Como você descobre o que está deixando um serviço lento?",
      "Como você escalaria um serviço que de repente recebe dez vezes mais tráfego?",
      "Como você decidiria entre escalar verticalmente, escalar horizontalmente ou redesenhar a arquitetura quando custo e prazo pesam ao mesmo tempo?",
    ],
  },
  "frontend-engineer": {
    "React and state management": [
      "Que tipos de aplicações React você já construiu?",
      "Como você decide onde um estado deve ficar?",
      "Como você gerenciaria dados do servidor, cache e estados de carregamento em uma aplicação React grande?",
      "Como você desembaraçaria uma base de código em que o estado é compartilhado em todo lugar e qualquer mudança causa bugs?",
    ],
    "performance and rendering": [
      "Como você percebe que uma página está lenta?",
      "O que você verifica primeiro quando um componente renderiza vezes demais?",
      "Como você aceleraria uma página que carrega uma lista enorme ou um bundle pesado?",
      "Como você definiria e faria valer um orçamento de performance em uma equipe que entrega funcionalidades toda semana?",
    ],
    accessibility: [
      "O que acessibilidade significa para você no dia a dia do frontend?",
      "Como você torna um dropdown ou modal personalizado utilizável apenas com o teclado?",
      "Como você testa acessibilidade, e o que faz quando um design não é acessível?",
      "Como você incluiria acessibilidade no processo da equipe quando os prazos pressionam no sentido contrário?",
    ],
    "working with designers and APIs": [
      "Como você costuma trabalhar com designers e engenheiros de backend?",
      "O que você faz quando um design está pouco claro ou não mostra estados como carregamento ou erro?",
      "Como você mantém o frontend avançando quando a API ainda não está pronta?",
      "O design e a API discordam sobre como uma funcionalidade deve funcionar. Como você resolve isso?",
    ],
  },
  "product-manager": {
    "prioritization and tradeoffs": [
      "Como você costuma decidir no que trabalhar a seguir?",
      "Como você escolhe entre duas boas funcionalidades quando só dá para construir uma?",
      "Como você diria não a um pedido importante de um stakeholder sem prejudicar o relacionamento?",
      "Você tem um prazo fixo e uma equipe menor. Como reorganiza o roadmap e explica as escolhas?",
    ],
    "customer discovery": [
      "Como você costuma descobrir o que os clientes precisam?",
      "Como você conduz uma entrevista com clientes para obter respostas honestas?",
      "Como você distingue o que os clientes pedem do que eles realmente precisam?",
      "Como você faria discovery para um produto em que é difícil alcançar os clientes?",
    ],
    "metrics and experimentation": [
      "Quais métricas você acompanha em um produto sob sua responsabilidade?",
      "Como você escolhe uma métrica de sucesso para uma nova funcionalidade?",
      "Como você desenharia um experimento, e o que o faria interrompê-lo mais cedo?",
      "Uma métrica sobe enquanto as reclamações dos clientes também sobem. Como você investiga e decide o que fazer?",
    ],
    "stakeholder communication": [
      "Como você mantém as pessoas informadas sobre o que sua equipe está construindo?",
      "Como você lida com stakeholders que discordam sobre prioridades?",
      "Como você comunica um atraso ou um lançamento que não deu certo para a liderança?",
      "Como você alinharia engenharia, vendas e suporte quando cada um quer um resultado diferente?",
    ],
  },
};
