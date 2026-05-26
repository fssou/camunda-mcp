# camunda-mcp

> MCP server (Model Context Protocol) com ferramentas para modelar BPMN **Camunda 7**,
> em Node.js, **independente do Camunda Modeler**.

Construído sobre [`bpmn-moddle`](https://github.com/bpmn-io/bpmn-moddle) e
[`camunda-bpmn-moddle`](https://github.com/camunda/camunda-bpmn-moddle), os mesmos
módulos do projeto `bpmn-js` — então o XML gerado é 100% compatível com o
Camunda Modeler / `bpmn-js`. Layout/DI é regenerado pelo
[`bpmn-auto-layout`](https://github.com/bpmn-io/bpmn-auto-layout).

Namespace de extensão usada: `http://camunda.org/schema/1.0/bpmn` (Camunda 7).

---

## Instalação

```bash
git clone https://github.com/fssou/camunda-mcp.git
cd camunda-mcp
npm install
npm run build
```

## Uso em clientes MCP

### Claude Desktop / Cursor / Continue (stdio)

Adicione no `mcpServers` do seu cliente:

```json
{
  "mcpServers": {
    "camunda7": {
      "command": "node",
      "args": ["/caminho/absoluto/para/camunda-mcp/dist/index.js"]
    }
  }
}
```

Após salvar, o cliente lista todas as ferramentas (~40) prefixadas com `camunda7`.

### Execução standalone (debug)

```bash
node dist/index.js
# imprime no stderr: "@fssou/camunda-mcp v0.1.0 ready on stdio"
# espera mensagens MCP JSON-RPC em stdin
```

---

## Ferramentas disponíveis

### Ciclo de vida do diagrama

| Tool | Descrição |
|---|---|
| `create_diagram` | Cria um novo diagrama em memória. Retorna `diagramId`. |
| `list_diagrams` | Lista diagramas abertos. |
| `delete_diagram` | Descarta um diagrama. |
| `load_diagram_xml` | Importa um XML BPMN 2.0. |
| `load_diagram_file` | Importa um arquivo `.bpmn` do disco. |
| `get_diagram_xml` | Serializa para XML. |
| `save_diagram` | Grava `.bpmn` em disco. |
| `auto_layout` | Regenera `bpmndi:BPMNDiagram` (shapes/edges) via `bpmn-auto-layout`. |
| `validate_diagram` | Lista erros/warnings estruturais. |

### Elementos BPMN

| Tool | Descrição |
|---|---|
| `add_start_event` | StartEvent (`none|message|timer|signal|error|conditional`). |
| `add_end_event` | EndEvent (`none|message|signal|error|escalation|terminate`). |
| `add_intermediate_event` | IntermediateCatchEvent / IntermediateThrowEvent. |
| `add_boundary_event` | BoundaryEvent anexado a uma atividade (interrupting ou não). |
| `add_task` | Task / UserTask / ServiceTask / SendTask / ReceiveTask / ScriptTask / BusinessRuleTask / ManualTask. |
| `add_gateway` | Exclusive / Parallel / Inclusive / EventBased / Complex. |
| `add_subprocess` | SubProcess / Transaction / AdHocSubProcess (event sub-process via `triggeredByEvent`). |
| `add_call_activity` | CallActivity (`calledElement`). |
| `add_text_annotation` | Anotação de texto. |
| `delete_element` | Remove o elemento e os fluxos incidentes. |
| `list_elements` | Lista elementos (filtros por tipo / parentId). |
| `get_element` | Inspeciona um elemento e suas extensões Camunda. |
| `set_name`, `set_documentation` | Mutações genéricas. |

### Fluxos

| Tool | Descrição |
|---|---|
| `connect_elements` | Cria um `bpmn:SequenceFlow` (com `conditionExpression` opcional). |
| `add_message_flow` | Cria um `bpmn:MessageFlow` entre participants. |
| `add_association` | Cria uma `bpmn:Association` (anotação ↔ elemento). |
| `set_default_flow` | Marca um fluxo como default de um gateway/atividade. |
| `set_condition_expression` | Define um `bpmn:FormalExpression` em um fluxo. |

### Pools e lanes

| Tool | Descrição |
|---|---|
| `add_participant` | Cria um Participant (pool) — promove o diagrama para `bpmn:Collaboration`. |
| `add_lane` | Cria uma Lane em um Participant. |
| `assign_to_lane` | Adiciona um flow node a uma lane (`flowNodeRef`). |

### Extensões Camunda 7

| Tool | Descrição |
|---|---|
| `set_task_implementation` | `class`, `expression` (+ `resultVariable`), `delegateExpression`, `external` (`topic`). |
| `set_async` | `asyncBefore`, `asyncAfter`, `exclusive`, `jobPriority`. |
| `set_user_task_assignment` | `assignee`, `candidateUsers`, `candidateGroups`, `dueDate`, `followUpDate`, `priority`. |
| `set_form` | `formKey` ou `formRef` + `camunda:FormData/FormField` embutido. |
| `set_io_mapping` | `camunda:InputOutput` com `camunda:InputParameter` / `camunda:OutputParameter` (`value` ou `camunda:Script`). |
| `set_camunda_properties` | Substitui `camunda:Properties`. |
| `add_execution_listener` | Anexa `camunda:ExecutionListener` (`start|end|take`) com `class`, `expression`, `delegateExpression` ou `script`. |
| `add_task_listener` | Anexa `camunda:TaskListener` (`create|assignment|complete|delete|update|timeout`) a um UserTask. |
| `set_error_event_definition` | Configura `bpmn:ErrorEventDefinition` + `bpmn:Error` + `camunda:errorCodeVariable`/`errorMessageVariable`. |
| `set_timer_event_definition` | `timeDuration` / `timeCycle` / `timeDate` (FormalExpression). |
| `set_message_event_definition` | Cria/reusa `bpmn:Message` e seta `messageRef`. |
| `set_signal_event_definition` | Cria/reusa `bpmn:Signal` e seta `signalRef`. |
| `set_process_attributes` | `id`, `name`, `isExecutable`, `camunda:versionTag`, `camunda:historyTimeToLive`, `camunda:jobPriority`, `camunda:candidateStarterUsers/Groups`, `camunda:isStartableInTasklist`. |

---

## Exemplo de fluxo

Após o cliente MCP chamar as ferramentas, o XML produzido tem o seguinte formato
(Camunda 7 plenamente válido):

```xml
<bpmn:definitions xmlns:bpmn="..." xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="Approval_Process" isExecutable="true"
                camunda:versionTag="1.0.0" camunda:historyTimeToLive="P30D">
    <bpmn:startEvent id="Event_..." name="Pedido recebido" />
    <bpmn:userTask id="Activity_..." name="Aprovar pedido"
                   camunda:candidateGroups="gerentes" camunda:dueDate="P1D"
                   camunda:asyncBefore="true" camunda:exclusive="true"
                   camunda:formKey="embedded:app:forms/approve.html" />
    <bpmn:exclusiveGateway id="Gateway_..." name="Aprovado?" />
    <bpmn:serviceTask id="Activity_..." name="Faturar"
                      camunda:delegateExpression="${invoiceService}">
      <bpmn:extensionElements>
        <camunda:inputOutput>
          <camunda:inputParameter name="orderId">${execution.getVariable("orderId")}</camunda:inputParameter>
          <camunda:outputParameter name="invoiceId">${result.id}</camunda:outputParameter>
        </camunda:inputOutput>
        <camunda:properties>
          <camunda:property name="retries" value="5" />
        </camunda:properties>
        <camunda:executionListener event="end" expression="${endListener.notify(execution)}" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:endEvent id="Event_..." name="Pedido recusado">
      <bpmn:errorEventDefinition errorRef="Error_PEDIDO_RECUSADO" />
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_..." name="Aprovado" sourceRef="Gateway_..." targetRef="Activity_...">
      <bpmn:conditionExpression>${approved}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
  </bpmn:process>
  <bpmn:error id="Error_PEDIDO_RECUSADO" name="Pedido recusado" errorCode="PEDIDO_RECUSADO" />
</bpmn:definitions>
```

Use `auto_layout` para regenerar `bpmndi:BPMNDiagram` quando o diagrama mudar.

---

## Desenvolvimento

```bash
npm install
npm run build         # compila TS → dist/
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest (smoke end-to-end)
npm run dev           # roda src/index.ts via tsx (stdio)
```

A árvore do projeto:

```
src/
├── index.ts              # stdio entrypoint
├── server.ts             # buildServer() — factory de McpServer
├── store.ts              # DiagramStore + DiagramSession
├── bpmn/
│   ├── moddle.ts         # cria BpmnModdle com camunda 7 descriptor
│   ├── builder.ts        # BpmnBuilder — adiciona/remove elementos
│   ├── camunda.ts        # helpers de extensões Camunda 7
│   ├── layout.ts         # wrapper de bpmn-auto-layout
│   ├── validate.ts       # validateDiagram()
│   ├── xml.ts            # fromXML / toXML / indexById
│   └── types.ts          # uniões discriminadas de tipos BPMN
└── tools/
    ├── registry.ts       # schemas Zod por tool
    └── handlers.ts       # dispatch(toolName, params)
test/
└── smoke.test.ts         # end-to-end: criação → exportação → auto-layout → round-trip
```

---

## Licença

MIT — veja [LICENSE](LICENSE).
