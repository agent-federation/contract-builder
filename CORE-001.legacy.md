# UIA-CORE-001 (Rev 0.3.3)
# Идентичность участников, мандаты, граф происхождения и локальное признание

| Поле | Значение |
|---|---|
| Document ID | `UIA-CORE-001` |
| Revision | `0.3.3` |
| Status | Candidate Draft Normative |
| Normative Basis | `UIA-INVARIANTS-001 Rev 0.2` + `INV-ID-03` |
| Scope | Participants, Identity Versions, Credentials, Lineage, Continuity Assessment, Local Acceptance |
| Depends On | UIA foundational invariants |
| Related Specifications | `UIA-CORE-002`, `UIA-CORE-003`, `UIA-CORE-004` |

---

## 0. Назначение и область действия

`UIA-CORE-001` определяет семантику идентичности участников, версий идентичности, криптографических мандатов, происхождения версий и локального признания участника доменом.

Документ устанавливает:

1. Онтологические границы между Participant, IdentityVersion, RuntimeInstance и AuthorityPrincipal.
2. Семантику деклараций происхождения и графа Lineage.
3. Правила криптографической идентификации и ограничения Credential.
4. Механизм локальной эпистемической оценки преемственности.
5. Условия применения версионных селекторов с учётом происхождения.
6. Семантику Local Acceptance и её жизненного цикла.
7. Контракты временной валидации и неизменяемости исторических артефактов.
8. Эталонный корпус тестирования соответствия.

### 0.1. Архитектурный принцип

UIA не устанавливает универсальную истину, не принуждает домены к единой оценке происхождения и не передаёт полномочия автоматически между участниками.

Архитектура должна позволять определить:

- кто заявил определённую идентичность;
- какая версия идентичности использовалась;
- какие декларации происхождения были сделаны;
- какие свойства этих деклараций проверены;
- каким доменом и в каком контексте версия признана;
- какие отдельные полномочия были предоставлены этой версии.

**Identity, Lineage, Assessment, Acceptance и Authority являются различными сущностями.**

### 0.2. Терминология нормативных требований

Ключевые слова MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT и MAY используются в нормативном смысле.

- **Invariant** — обязательное семантическое свойство UIA.
- **Contract** — обязательный интерфейс или правило взаимодействия компонентов.
- **Mechanism** — допустимый способ реализации контракта.
- **Policy** — локальное правило конкретного домена.
- **Open Question** — вопрос, намеренно оставленный за пределами текущей редакции.

---

# 1. Фундаментальная онтология

UIA различает четыре концептуальных пространства.

## 1.1. Participant

`Participant` — устойчивый субъект идентификации и атрибуции действий.

Он отвечает на вопрос:

> К чьей истории и происхождению относится данный акт?

Participant может представлять:

- HUMAN;
- AGENT;
- SERVICE;
- EXTERNAL_SYSTEM.

Participant является логическим субъектом и не обязан соответствовать одному физическому устройству, процессу или криптографическому ключу.

Participant не является автоматически:

- носителем полномочий;
- владельцем приватных ключей;
- юридически ответственным лицом;
- гарантом безопасности своих версий;
- владельцем всех артефактов, связанных с его происхождением.

Юридическая, материальная или иная ответственность требует отдельного нормативного, договорного или правового основания.

## 1.2. IdentityVersion

`IdentityVersion` — неизменяемый снимок объявленных свойств идентичности участника.

Он может содержать:

- идентификатор версии;
- идентификатор Participant;
- схему и метку версии;
- объявленные протоколы;
- публичные Credentials;
- декларации Lineage;
- время публикации.

IdentityVersion не является Runtime и не описывает текущее состояние исполнения.

Создание новой версии не изменяет ранее опубликованные версии.

## 1.3. RuntimeInstance

`RuntimeInstance` — конкретный процесс, сессия или экземпляр исполнения, работающий в определённом execution context.

Один IdentityVersion MAY иметь несколько одновременно работающих RuntimeInstance.

Падение, остановка или компрометация одного RuntimeInstance не изменяет автоматически другие экземпляры или исходный IdentityVersion.

## 1.4. AuthorityPrincipal

`AuthorityPrincipal` — субъект полномочий внутри конкретного домена.

Он может получать полномочия посредством механизмов, определённых в `UIA-CORE-003`.

IdentityVersion, Participant и RuntimeInstance не становятся AuthorityPrincipal автоматически.

## 1.5. Базовые аксиомы

- Один Participant MAY иметь одну или несколько IdentityVersion.
- Каждая IdentityVersion MUST принадлежать ровно одному Participant.
- Lineage MUST связывать IdentityVersion, а не абстрактные Participant.
- Lineage MAY пересекать границы Participant.
- Создание, продолжение, разделение или слияние IdentityVersion не создаёт автоматически полномочий.
- Идентичность не подразумевает наследование памяти, репутации, обязательств или ответственности.
- RuntimeInstance не является новой IdentityVersion только вследствие запуска или перезапуска процесса.

---

# 2. Инварианты идентичности и происхождения

## 2.1. INV-ID-01: Lineage Does Not Imply Authority Inheritance

Связь происхождения между версиями не создаёт автоматического наследования:

- capabilities;
- access rights;
- Authority Grants;
- obligations;
- reputation;
- memory;
- responsibility;
- execution permissions.

Любое предоставление полномочий требует отдельного механизма, определённого в `UIA-CORE-003`.

## 2.2. INV-ID-02: Identity and Authority Graph Separation

UIA MUST разделять два независимых графа.

**Identity Lineage Graph**

Узлы:
- IdentityVersion.

Рёбра:
- CONTINUATION;
- FORKED_FROM;
- MERGED_FROM.

**Authority Relationship Graph**

Узлы:
- AuthorityPrincipal;
- Capability.

Рёбра:
- GRANTED_TO;
- DELEGATED_BY;
- ATTENUATED_TO;
- REVOKED_BY.

Ребро Identity Lineage MUST NOT создавать ребро Authority Relationship.

## 2.3. INV-ID-03: Declaration, Assessment and Acceptance Separation

Система MUST разделять три независимые сущности.

### Lineage Declaration

Неизменяемое заявление автора IdentityVersion о происхождении версии.

### Lineage Assessment

Локальная эпистемическая оценка конкретного домена относительно полноты, структуры и проверяемых свойств Lineage Declaration.

### Local Acceptance

Самостоятельный нормативный акт конкретного домена, определяющий допустимость версии в заданном контексте.

Ни одна из этих сущностей:

- не изменяет исходную декларацию;
- не заменяет другую сущность;
- не обязывает другие домены принимать аналогичную оценку;
- не создаёт автоматически полномочий.

---

# 3. Immutable Descriptors

Дескрипторы идентичности являются неизменяемыми декларативными артефактами.

Динамические характеристики, такие как доступность, состояние Runtime, блокировки и текущие оценки, MUST NOT записываться посредством мутации исходного дескриптора.

## 3.1. ParticipantRecord

```typescript
interface ParticipantRecord {
  id: ParticipantID;
  kind: ParticipantKind;
  home_domain: DomainID;
  registered_at: Timestamp;
}

type ParticipantKind =
  | "HUMAN"
  | "AGENT"
  | "SERVICE"
  | "EXTERNAL_SYSTEM";
```

`ParticipantRecord` идентифицирует логического участника.

Его регистрация сама по себе не означает, что другие домены признали его или предоставили ему права.

## 3.2. IdentityVersionDescriptor

```typescript
enum VersionScheme {
  SEMVER_2 = "SEMVER_2",
  CONTENT_HASH = "CONTENT_HASH",
  OPAQUE_TAG = "OPAQUE_TAG"
}

interface IdentityVersionDescriptor {
  id: IdentityVersionID;
  participant_id: ParticipantID;

  version_label: string;
  version_scheme: VersionScheme;

  declared_protocols: string[];

  public_credentials: CredentialDescriptor[];

  lineage: LineageLink[];

  published_at: Timestamp;
}
```

### Семантика VersionScheme

- `SEMVER_2` — версия соответствует Semantic Versioning 2.0.0.
- `CONTENT_HASH` — метка содержит идентификатор хеша содержимого.
- `OPAQUE_TAG` — произвольная строка без универсальной семантики сравнения.

Диапазонные selector expressions MUST использовать только совместимые схемы версионирования.

`OPAQUE_TAG` допускает только точное сопоставление, если локальная политика явно не определяет иной механизм.

`CONTENT_HASH` не должен интерпретироваться как SemVer.

## 3.3. RuntimeInstanceDescriptor

```typescript
interface RuntimeInstanceDescriptor {
  id: RuntimeInstanceID;
  identity_version_id: IdentityVersionID;

  execution_context_ref: string;

  ephemeral_public_key?: string;

  instantiated_at: Timestamp;
}
```

Heartbeat, остановка, сбой, перезапуск и другие изменения Runtime MUST представляться отдельными событиями жизненного цикла.

CORE-001 не определяет полный формат этих событий. Он относится к области CORE-002.

---

# 4. Credential Semantics

Credential — криптографический мандат, связывающий публичный ключ с определённой идентичностью или Runtime в заданном контексте.

Credential не является полномочием.

## 4.1. Криптографические гарантии

Валидная криптографическая подпись подтверждает, что подписанная полезная нагрузка была подписана приватным ключом, математически соответствующим указанному открытому ключу, при соблюдении применимых криптографических допущений.

Подпись самостоятельно НЕ доказывает:

1. Кто физически или логически управлял приватным ключом.
2. Не был ли ключ скомпрометирован до момента подписания.
3. Обладал ли оператор ключа намерением совершить действие.
4. Обладал ли оператор полномочиями совершить действие.
5. Являлся ли подписавший процесс легитимным RuntimeInstance.
6. Было ли содержание подписанного сообщения истинным.

Криптографическая проверка подтверждает отношение между подписью, payload и публичным ключом, но не всю цепочку атрибуции.

## 4.2. CredentialDescriptor

```typescript
type CredentialID = string;

enum CredentialUsage {
  AUTHENTICATION = "AUTHENTICATION",
  SIGNING = "SIGNING",
  ENCRYPTION = "ENCRYPTION"
}

interface CredentialDescriptor {
  credential_id: CredentialID;

  issuer_domain: DomainID;

  usage: CredentialUsage[];

  algorithm_family: string;

  public_key_canonical: string;

  not_before: Timestamp;
  not_after?: Timestamp;

  revocation_endpoint_ref?: string;
}
```

Credential MUST быть связан с конкретным IdentityVersion или RuntimeInstance.

Credential MUST NOT принадлежать абстрактному Participant без конкретного контекста ключа.

`issuer_domain` обозначает домен, зарегистрировавший или выпустивший Credential Descriptor. Он сам по себе не доказывает доверие к этому домену.

## 4.3. Credential Usage

- `AUTHENTICATION` — аутентификация канала или сессии.
- `SIGNING` — подписание деклараций, артефактов и сообщений.
- `ENCRYPTION` — использование публичного ключа для конфиденциальной адресации.

Использование Credential за пределами объявленного назначения MUST быть запрещено локальной проверкой.

## 4.4. Credential Revocation

Отзыв Credential является самостоятельным событием и не изменяет исходный IdentityVersionDescriptor.

```typescript
enum RevocationReason {
  ROTATION = "ROTATION",
  KEY_LOST = "KEY_LOST",
  SUSPECTED_COMPROMISE = "SUSPECTED_COMPROMISE",
  CONFIRMED_COMPROMISE = "CONFIRMED_COMPROMISE",
  ADMINISTRATIVE = "ADMINISTRATIVE"
}

interface CredentialRevocationRecord {
  credential_id: CredentialID;

  revoked_by_domain: DomainID;

  revoked_at: Timestamp;

  reason: RevocationReason;

  compromise_effective_at?: Timestamp;

  compromise_time_basis?: string;

  compromise_time_evidence_refs?: string[];

  evidence_refs: string[];
}
```

### 4.4.1. Семантика отзыва

**ROTATION**

Плановая ротация ключа.

Подписи, созданные до момента отзыва, могут сохранять историческую валидность при соблюдении временных и криптографических условий.

**KEY_LOST**

Утрата контроля над ключом без подтверждённых признаков компрометации.

Исторические подписи требуют интерпретации в соответствии с локальной политикой и имеющимися доказательствами.

**SUSPECTED_COMPROMISE**

Подозрение на компрометацию.

Зависимые оценки SHOULD быть помечены для переоценки. Подозрение само по себе не является доказательством компрометации.

**CONFIRMED_COMPROMISE**

Подтверждённая компрометация.

Если `compromise_effective_at` установлен и принят локальной политикой, подписи с `signed_at >= compromise_effective_at` MUST считаться непригодными для подтверждения соответствующих криптографических Claims.

Если время начала компрометации неизвестно, исторические подписи переводятся в состояние `CONTESTED_COMPROMISED`.

Они MUST NOT использоваться как достаточное основание для подтверждения преемственности или будущей авторизации без дополнительной нормативной оценки.

Указанное `compromise_effective_at` является утверждением, требующим доказательной основы. Его наличие само по себе не делает время компрометации достоверным.

**ADMINISTRATIVE**

Административное прекращение эксплуатации Credential.

Само по себе не означает, что предыдущие подписи были скомпрометированы.

### 4.4.2. Temporal Validity of Historical Signatures

Подпись может быть валидной как историческое свидетельство и одновременно непригодной для будущей авторизации.

Эти два результата MUST различаться.

Решение о ретроспективной валидности зависит от:

- времени подписания;
- времени публикации отзыва;
- причины отзыва;
- установленного времени компрометации;
- доказательств, подтверждающих это время;
- локальной политики проверки.

Отзыв Credential MUST NOT удалять исходный Credential Descriptor или IdentityVersionDescriptor.

---

# 5. Lineage Graph

Lineage Graph представляет собой граф деклараций происхождения IdentityVersion.

Все рёбра направлены:

**Child → Parent**

```text
[Child IdentityVersion] ──LineageLink──► [Parent IdentityVersion]
```

## 5.1. LineageLink

```typescript
enum LineageRelationType {
  CONTINUATION = "CONTINUATION",
  FORKED_FROM = "FORKED_FROM",
  MERGED_FROM = "MERGED_FROM"
}

interface LineageLink {
  parent_version_id: IdentityVersionID;

  relation: LineageRelationType;

  declared_rationale?: string;

  continuity_proof_ref?: string;
}
```

## 5.2. Кардинальность и семантика отношений

| Relation | Количество родителей | Ограничение | Значение |
|---|---:|---|---|
| CONTINUATION | Ровно 1 | Тот же Participant | Продолжение линии идентичности |
| FORKED_FROM | Ровно 1 | Любой Participant | Создание независимой ветки |
| MERGED_FROM | 2 или более | Любой Participant | Объединение нескольких линий |

### CONTINUATION

Прямое продолжение версии тем же Participant.

`parent.participant_id MUST equal child.participant_id`.

Новая версия не делает старую версию автоматически недействительной или устаревшей.

### FORKED_FROM

Создание независимой ветки от одного предка.

Предок может принадлежать тому же или другому Participant.

FORKED_FROM не передаёт автоматически полномочия, Credential, ответственность или репутацию предка.

### MERGED_FROM

Явное объединение двух или более родительских линий.

Каждое родительское отношение должно быть представлено отдельным LineageLink.

MERGED_FROM не означает автоматического объединения полномочий или Participant.

## 5.3. Композитные декларации

Если версия Participant A продолжает собственную линию, но использует материалы версии Participant B, идентичность и происхождение материалов должны моделироваться отдельно.

Например:

```text
A@1.0 ──CONTINUATION──► A@0.9
```

Заимствование материалов из `B@1.0` оформляется отдельным отношением происхождения артефакта:

```text
Artifact X ──DERIVED_FROM──► Artifact Y
```

`DERIVED_FROM` не является типом LineageLink и не входит в Identity Lineage Graph.

---

# 6. Lineage Declaration, Assessment и Local Acceptance

## 6.1. Declaration

Lineage Declaration — часть неизменяемого IdentityVersionDescriptor.

Декларация отражает заявление автора о происхождении версии.

Она не становится ложной или истинной вследствие локального решения другого домена.

## 6.2. Assessment

Lineage Assessment — неизменяемый документ локальной оценки декларации.

Разные домены MAY выпускать различные Assessment относительно одной и той же декларации.

Assessment одного домена не обязывает другой домен принять его выводы.

### 6.2.1. ContinuityAssessment

```typescript
type AssessmentID = string;

interface ContinuityAssessment {
  assessment_id: AssessmentID;

  supersedes_assessment_id?: AssessmentID;

  subject_version_id: IdentityVersionID;

  parent_version_ids: IdentityVersionID[];

  declared_relation: LineageRelationType;

  assessment_profile_ref: string;

  assessment_method_version: string;

  verified_claims: string[];

  unverified_claims: string[];

  evidence_refs: string[];

  assessed_by: DomainID;

  assessed_at: Timestamp;
}
```

### 6.2.2. Семантика Claims

`verified_claims` содержит Claims, подтверждённые в рамках указанной методики и доступных доказательств.

`unverified_claims` содержит Claims, которые не подтверждены, не проверены или не могут быть приняты в рамках указанной оценки.

Отсутствие Claim в `verified_claims` MUST NOT интерпретироваться как его подтверждение.

Claims являются идентификаторами проверяемых утверждений, а не произвольными строками для числового скоринга.

Примеры:

- `PARENT_SIGNATURE_MATCH`;
- `DESCRIPTOR_HASH_CONFIRMED`;
- `ROOT_GOVERNANCE_ATTESTED`;
- `SOURCE_SPEC_EVALUATED`;
- `PARENT_UNRESOLVED`;
- `CYCLE_DETECTED`;
- `KEY_COMPROMISED`.

### 6.2.3. Assessment Reproducibility

`assessment_profile_ref` идентифицирует профиль требований или методику оценки.

`assessment_method_version` идентифицирует версию конкретного метода или реализации верификатора.

Эти поля MUST быть зафиксированы для воспроизводимости и последующего аудита.

CORE-001 не требует единой универсальной методики оценки.

### 6.2.4. Evidence References

`evidence_refs` содержит ссылки на доказательные артефакты, использованные при оценке.

Ссылка на доказательство не означает автоматического признания доказательства истинным или достаточным.

Семантика Evidence и его полноценная модель определяются в `UIA-CORE-004`.

## 6.3. Assessment Supersession

Assessment является неизменяемым документом.

Если новые обстоятельства изменяют оценку, выпускается новый Assessment.

Новый документ MAY содержать ссылку `supersedes_assessment_id`.

Нормативные ограничения:

1. Assessment MUST NOT изменяться после публикации.
2. Один Assessment MAY непосредственно ссылаться максимум на один заменяемый Assessment.
3. Supersession chain MUST NOT содержать циклов.
4. Старый Assessment MUST сохраняться как исторический документ.
5. Supersession не удаляет и не переписывает решения, ранее основанные на старой оценке.
6. Выбор Assessment, применимого к конкретному решению, определяется локальной политикой с учётом области действия, времени, доверия к оценщику и доказательств.

Самый новый Assessment не становится автоматически самым авторитетным.

## 6.4. Conflicting Assessors

Если домен использует внешние оценки, он MUST явно определять доверенных оценщиков.

```typescript
interface ContinuityAssuranceRequirement {
  required_claims: string[];

  disallowed_claims?: string[];

  trusted_assessors?: DomainID[];
}
```

`required_claims` трактуется как конъюнкция: все перечисленные Claims должны быть подтверждены.

`disallowed_claims` определяет Claims, наличие которых препятствует удовлетворению требования.

`trusted_assessors` задаёт домены, чьи оценки могут учитываться в рамках соответствующей политики.

Если два применимых доверенных Assessment противоречат друг другу, система MUST NOT выбирать победителя автоматически по большинству.

Противоречие переводит соответствующий Claim в локальное состояние `CONTESTED`.

Зависимые от этого Claim решения не могут опираться на него до локального нормативного разрешения коллизии.

Оценка недоверенного домена не получает приоритет только вследствие того, что она более новая или положительная.

---

# 7. Canonicalization и Descriptor Hash

Для Claim `DESCRIPTOR_HASH_CONFIRMED` применяется единый контракт каноникализации.

## 7.1. Hashing Scope

Хешируется неизменяемое содержимое `IdentityVersionDescriptor`, включающее:

- `id`;
- `participant_id`;
- `version_label`;
- `version_scheme`;
- `declared_protocols`;
- `public_credentials`;
- `lineage`;
- `published_at`.

В хешируемый объект MUST NOT включаться:

- транспортный Envelope;
- внешние подписи сообщений;
- метаданные доставки;
- метаданные локального Ledger;
- последующие события жизненного цикла;
- последующие Assessment;
- события Credential Revocation;
- Local Acceptance.

## 7.2. Canonicalization Algorithm

1. Дескриптор сериализуется в соответствии с RFC 8785 (JSON Canonicalization Scheme).
2. Полученное каноническое представление используется как вход для SHA-256.
3. Вычисленный digest сравнивается с заявленным значением.
4. Несовпадение хотя бы одного байта означает, что Claim `DESCRIPTOR_HASH_CONFIRMED` не подтверждён.

Идентификатор хеша MUST включать алгоритм:

```text
urn:hash:<algorithm>:<digest>
```

Пример:

```text
urn:hash:sha256:4b227777d4dd1fc61c6f884f48641d02...
```

Отзыв Credential или выпуск нового Assessment не изменяет хеш исходного дескриптора.

---

# 8. Conditional Version Binding и Selector Traversal

CORE-001 определяет семантику проверки происхождения при использовании условного версионного связывания.

Он не предоставляет полномочия самостоятельно. Полноценная модель Authority Grant определяется в `UIA-CORE-003`.

## 8.1. LineageTraversalScope

```typescript
enum LineageTraversalScope {
  CONTINUATION_ONLY = "CONTINUATION_ONLY",

  CONTINUATION_AND_FORK = "CONTINUATION_AND_FORK",

  FULL_ANCESTRY = "FULL_ANCESTRY"
}
```

Семантика:

- `CONTINUATION_ONLY` — допускаются только рёбра CONTINUATION.
- `CONTINUATION_AND_FORK` — допускаются CONTINUATION и FORKED_FROM.
- `FULL_ANCESTRY` — допускаются все типы LineageLink, включая MERGED_FROM.

## 8.2. ConditionalVersionBinding

```typescript
interface ConditionalVersionBinding {
  target_participant_id: ParticipantID;

  origin_version_id: IdentityVersionID;

  selector_expression: string;

  traversal_scope: LineageTraversalScope;

  assurance_requirement: ContinuityAssuranceRequirement;
}
```

`origin_version_id` является обязательным якорем.

Он определяет IdentityVersion, относительно которой проверяется преемственность кандидата.

## 8.3. Предварительные проверки

Для кандидата `V_candidate` относительно `V_origin` проверяются:

1. Participant кандидата соответствует `target_participant_id`.
2. VersionScheme совместима с `selector_expression`.
3. `version_label` удовлетворяет селектору.
4. Существует допустимый путь от кандидата к origin.
5. Все необходимые переходы и merge closure удовлетворяют `assurance_requirement`.

Невыполнение любого обязательного условия приводит к отказу в применении Binding.

## 8.4. Path Discovery

Направление обхода соответствует направлению Lineage:

```text
V_candidate ──► Parent ──► ... ──► V_origin
```

Path Discovery выполняется по рёбрам, разрешённым выбранным `traversal_scope`.

Если допустимого пути к `V_origin` нет, результат:

```text
ERR_NO_TRAVERSAL_PATH
```

Если существует несколько допустимых путей, каждый путь рассматривается независимо.

Наличие нескольких путей само по себе не является ошибкой.

Кандидат может удовлетворить Binding, если существует хотя бы один допустимый путь, который проходит все требования Path Validation и Merge Closure Validation.

## 8.5. Path Validation

Каждое ребро выбранного пути MUST:

1. Соответствовать `traversal_scope`.
2. Иметь применимый `ContinuityAssessment`.
3. Удовлетворять `assurance_requirement`.
4. Не содержать применимых дисквалифицирующих Claims.
5. Не иметь неразрешённого конфликта применимых Assessment.

Отсутствие Assessment не означает успешную проверку.

## 8.6. Merge Closure Validation

Если выбранный путь проходит через IdentityVersion, имеющий отношение `MERGED_FROM`, система MUST проверить все родительские рёбра этого merge-узла.

Проверка распространяется на все родительские ветви, включая те, которые не ведут к `V_origin`.

Для каждого родительского ребра требуется применимый Assessment, удовлетворяющий `assurance_requirement`.

Это правило называется:

`ALL_BRANCHES_MUST_SATISFY`.

Невыполнение требования хотя бы одной родительской ветвью означает:

```text
ERR_MERGE_BRANCH_UNSATISFIED
```

Проверка merge closure не должна ограничиваться только родительскими ветвями, участвующими в конкретном пути к origin.

## 8.7. Diamond Lineage

Для ромбовидного графа:

```text
             ┌──► B ──► A
             │
D ──MERGE────┤
             │
             └──► C ──► A
```

Оба пути могут вести к одному origin.

Каждый путь проверяется независимо.

Для каждого merge-узла на выбранном пути дополнительно проверяются все его родительские рёбра.

Если хотя бы одна родительская ветвь merge-узла не удовлетворяет требованиям, соответствующий путь считается непригодным.

Кандидат признаётся преемником, если существует хотя бы один полностью допустимый путь и все merge closure requirements на этом пути удовлетворены.

## 8.8. Детерминированность реализации

Реализации MUST возвращать одинаковый результат для одинакового набора:

- Lineage Declarations;
- применимых Assessments;
- Credential Revocation Records;
- Assurance Requirements;
- локальных политик;
- временного контекста проверки.

Результат MUST NOT зависеть от:

- порядка хранения рёбер;
- порядка поступления уже доступных деклараций;
- порядка обхода узлов;
- внутреннего алгоритма оптимизации.

Реализация MAY использовать мемоизацию, динамическое программирование и другие методы оптимизации.

Она MUST NOT требовать явного перечисления всех возможных путей, если результат может быть вычислен эквивалентным способом.

Обнаруженный цикл в локальной модели графа MUST обрабатываться как конфликт структуры, а не как основание для аварийного завершения системы.

---

# 9. Local Acceptance

Local Acceptance — самостоятельный нормативный акт домена, определяющий допустимость IdentityVersion в конкретном контексте.

Он не является Authority Grant.

## 9.1. LocalAcceptanceRecord

```typescript
type AcceptanceID = string;

enum AcceptanceDecision {
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED"
}

interface LocalAcceptanceRecord {
  acceptance_id: AcceptanceID;

  subject_version_id: IdentityVersionID;

  accepting_domain: DomainID;

  context_scope: string;

  grounding_assessments: AssessmentID[];

  decision: AcceptanceDecision;

  policy_rule_ref: string;

  decided_by_principal: string;

  decided_at: Timestamp;
}
```

`LocalAcceptanceRecord` является неизменяемым актом.

Он фиксирует:

- кто был признан;
- каким доменом;
- в каком контексте;
- на основании каких Assessment;
- по какой локальной политике;
- кем и когда было принято решение.

## 9.2. Контекстная применимость

Local Acceptance не является универсальным условием всех взаимодействий.

Домен MAY:

- разрешать чтение публичных сообщений без Local Acceptance;
- принимать внешние Evidence и Claims без признания отправителя;
- требовать Local Acceptance для определённых ролей;
- требовать отдельный Authority Grant для consequential actions.

Применимость Local Acceptance определяется политикой домена и конкретным контекстом.

Один домен не обязан признавать участника только потому, что другой домен уже выпустил LocalAcceptanceRecord.

## 9.3. Acceptance Lifecycle

Изменение применимости ранее вынесенного решения фиксируется отдельными событиями.

```typescript
enum AcceptanceLifecycleState {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  REINSTATED = "REINSTATED",
  REVOKED = "REVOKED",
  EXPIRED = "EXPIRED"
}

interface LocalAcceptanceLifecycleEvent {
  event_id: string;

  acceptance_id: AcceptanceID;

  new_state: AcceptanceLifecycleState;

  transition_reason: string;

  evidence_refs: string[];

  effective_at: Timestamp;
}
```

Lifecycle Event MUST NOT изменять исходный LocalAcceptanceRecord.

Переходы жизненного цикла должны проверяться относительно предыдущего состояния и локальной политики.

CORE-001 не устанавливает универсальную политику автоматического перехода между состояниями.

---

# 10. Temporal Reference Model

UIA различает пять временных характеристик.

| Поле | Значение |
|---|---|
| asserted_at | Время заявления, указанное автором |
| signed_at | Время подписания, если оно удостоверено применимым механизмом |
| ingested_at | Время фиксации документа локальным Ledger |
| assessed_at | Время проведения эпистемической оценки |
| decided_at | Время нормативного решения или авторизации |

Эти временные метки не являются взаимозаменяемыми.

## 10.1. Trust in Timestamps

`asserted_at` является заявленным временем и само по себе не доказывает фактический момент создания документа.

` signed_at` может считаться удостоверенным временем только при наличии применимого механизма доверенной временной фиксации.

`ingested_at` отражает локальный факт получения или фиксации документа конкретным доменом.

`assessed_at` и `decided_at` относятся к действиям конкретного домена.

UIA не предполагает наличие единого глобального доверенного времени.

## 10.2. Temporal Validation

При проверке Credential домен MUST определить, какой временной момент используется для конкретной операции.

В зависимости от политики это может быть:

- момент подписания;
- момент получения;
- момент оценки;
- момент принятия решения;
- момент исполнения действия.

Для исторической проверки подписи и для будущей авторизации могут применяться разные временные правила.

Отзыв Credential после подписания не означает автоматически, что историческая подпись была недействительной.

Однако последующая подтверждённая компрометация может сделать историческую подпись непригодной для использования как доказательства.

## 10.3. TOCTOU

Проверка применимости Credential или Assessment в момент принятия решения не гарантирует, что их состояние не изменится до исполнения действия.

CORE-001 определяет временные основания проверки, но не полный механизм JIT Execution Authorization.

Проверки непосредственно перед исполнением и обработка TOCTOU относятся к `UIA-CORE-003`.

---

# 11. Локальная оценка графа и федерация

Декларации могут поступать в домен независимо от порядка регистрации родительских версий.

## 11.1. Delayed Parent Resolution

Если дескриптор дочерней версии получен раньше родительского:

- декларация MUST быть сохранена;
- ссылка на родителя MUST быть сохранена;
- локальная оценка MUST фиксировать неразрешённость родителя;
- декларация MUST NOT удаляться или изменяться только из-за отсутствия родителя.

Пример:

```text
verified_claims: []

unverified_claims:
  - PARENT_UNRESOLVED
```

После получения родительского дескриптора домен MAY выпустить новый Assessment.

## 11.2. Cycle Detection

Локальный граф MUST быть проверен на циклические связи.

При обнаружении цикла:

- исходные декларации сохраняются;
- Assessment фиксирует `CYCLE_DETECTED`;
- цикл не принимается как корректное доказательство преемственности;
- домен MUST NOT применять зависимые от такой преемственности гранты;
- домен MAY продолжить обработку сообщений в режиме Read-Only или Non-Consequential Interaction, если это разрешено локальной политикой.

Обнаружение цикла не требует глобальной блокировки Participant или удаления IdentityVersion.

## 11.3. Domain Sovereignty

Каждый домен сохраняет право самостоятельно определять:

- какие внешние домены считать доверенными оценщиками;
- какие Assessment принимать;
- какие Lineage Relations считать допустимыми;
- какие версии признавать;
- какие последствия применять к конфликтующим декларациям.

Внешний домен может предоставить Evidence или Assessment, но не может принудить другой домен принять определённую оценку или вынести конкретное решение.

---

# 12. Conformance Test Corpus

Тесты разделены по уровням ответственности.

Каждый тест определяет:

- Preconditions;
- Input Artifacts или Events;
- Expected Result;
- Expected State Effects;
- Forbidden Side Effects.

## Category A: Structural Lineage Validation

### A-1. Valid Continuation

**Preconditions**

Зарегистрирована версия:

`A@1.0.0`

**Input**

Новая версия:

`A@1.1.0`

с единственным ребром:

`A@1.1.0 ──CONTINUATION──► A@1.0.0`

**Expected Result**

Декларация принимается.

**Forbidden Side Effects**

- Предыдущая версия не удаляется.
- Предыдущая версия не получает автоматический статус DEPRECATED.
- Полномочия не наследуются.

### A-2. Cross-Participant Continuation Rejection

**Preconditions**

`A@1.0.0` и `B@1.0.0` принадлежат разным Participant.

**Input**

`B@1.0.0` объявляет CONTINUATION от `A@1.0.0`.

**Expected Result**

`ERR_INVALID_RELATION`.

**Forbidden Side Effects**

Декларация не принимается как корректное ребро CONTINUATION.

### A-3. Valid Fork

**Preconditions**

Зарегистрирована версия `A@1.0.0`.

**Input**

`B@1.0.0` объявляет:

`B@1.0.0 ──FORKED_FROM──► A@1.0.0`

**Expected Result**

Декларация принимается.

**Forbidden Side Effects**

- Предок не изменяется.
- Credential предка не копируются.
- Полномочия предка не наследуются.

### A-4. Fork Cardinality

**Preconditions**

Зарегистрированы два родителя.

**Input**

Одна версия объявляет два родителя через FORKED_FROM.

**Expected Result**

`ERR_INVALID_CARDINALITY`.

**Forbidden Side Effects**

Некорректный дескриптор не регистрируется как валидная версия.

### A-5. Valid Merge

**Preconditions**

Зарегистрированы две родительские версии.

**Input**

Новая версия объявляет MERGED_FROM с двумя родителями.

**Expected Result**

Декларация принимается при соблюдении остальных структурных условий.

**Forbidden Side Effects**

Полномочия обоих родителей не объединяются автоматически.

## Category B: Authority Binding and Traversal Integration

### B-1. Exact Binding Isolation

**Preconditions**

Грант предназначен исключительно для:

`A@1.0.0`

Binding: EXACT.

**Input**

Запрос поступает от `A@1.1.0`, имеющей подтверждённый CONTINUATION от `A@1.0.0`.

**Expected Result**

`ERR_AUTHORITY_BINDING_MISMATCH`.

**Forbidden Side Effects**

- Исходный Grant не изменяется.
- Новый Grant автоматически не создаётся.

### B-2. Unsatisfied Assurance Predicate

**Preconditions**

Conditional Binding требует:

```typescript
required_claims: [
  "PARENT_SIGNATURE_MATCH",
  "GOVERNANCE_REVIEWED"
]
```

Assessment подтверждает только:

```typescript
verified_claims: [
  "PARENT_SIGNATURE_MATCH"
]
```

**Expected Result**

`ERR_ASSURANCE_PREDICATE_UNSATISFIED`.

**Forbidden Side Effects**

- IdentityVersion остаётся зарегистрированной.
- Декларация Lineage не удаляется.
- Числовой скоринг не заменяет проверку Claims.

### B-3. Diamond Lineage

**Preconditions**

Граф:

```text
A
├── FORKED_FROM ──► B
└── CONTINUATION ─► C

D
└── MERGED_FROM ──► B, C
```

Для проверки путей к `A` существуют применимые Assessment:

- `D → B`;
- `B → A`;
- `D → C`;
- `C → A`.

Все Assessment удовлетворяют требованиям.

**Input**

Запрос от `D` относительно origin `A`.

**Expected Result**

Успех. Существуют два допустимых пути:

- `D → B → A`;
- `D → C → A`.

Все родительские ветви merge-узла D проходят Merge Closure Validation.

**Forbidden Side Effects**

Промежуточные версии B и C не получают автоматических прав Grant A.

### B-4. Merge Closure Failure

**Preconditions**

Используется тот же граф A, B, C, D.

Assessment для ветви `D → C` удовлетворяет требованиям.

Assessment для ветви `D → B` отсутствует или содержит дисквалифицирующий Claim.

**Input**

Запрос от `D` относительно origin `A`.

**Expected Result**

`ERR_MERGE_BRANCH_UNSATISFIED`.

**Forbidden Side Effects**

- Частичный допуск merge-версии запрещён.
- Невалидная ветвь не игнорируется только потому, что другая ветвь ведёт к origin.

### B-5. Trusted and Untrusted Assessors

**Preconditions**

Локальная политика доверяет `domain-auditor`.

`domain-auditor` выпускает Assessment с:

`unverified_claims: ["SPEC_MISMATCH"]`

`untrusted.org` выпускает положительный Assessment.

**Expected Result**

Отказ в удовлетворении требования, если применимая оценка доверенного аудитора не подтверждает обязательный Claim.

**Forbidden Side Effects**

Положительная оценка недоверенного домена не отменяет отрицательную оценку доверенного домена.

### B-6. Merge Closure with Non-Origin Branch

**Preconditions**

Граф:

```text
             ┌──► B ──► A
             │
D ──MERGE────┤
             │
             └──► C ──► X
```

Грант выдан относительно origin `A`.

Ветка `D → C` не ведёт к `A`.

**Input**

Запрос от `D` относительно `A`.

**Expected Result**

Если Assessment для `D → C` отсутствует или не удовлетворяет требованиям, путь через merge-узел D отклоняется.

**Forbidden Side Effects**

Ветка C не игнорируется только из-за того, что она не ведёт к origin.

### B-7. Assessment Arrival Order Independence

**Preconditions**

Одинаковый итоговый набор деклараций, Assessment, политик и временного контекста.

**Input**

Два варианта поступления данных:

1. Assessment получены в порядке A, B, C.
2. Те же Assessment получены в порядке C, A, B.

**Expected Result**

После получения полного одинакового набора данных результат проверки Binding одинаков.

**Forbidden Side Effects**

Порядок доставки не создаёт различий в семантическом результате.

## Category C: Federation and Local Assessment

### C-1. Orphan Ingestion

**Preconditions**

Родительский дескриптор отсутствует в локальном домене.

**Input**

Получен дочерний IdentityVersion с LineageLink на отсутствующего родителя.

**Expected Result**

- Дескриптор сохраняется.
- Оценка фиксирует `PARENT_UNRESOLVED`.

**Forbidden Side Effects**

Декларация не удаляется и не переписывается.

### C-2. Cycle Detection

**Preconditions**

В графе обнаружен цикл:

`V1 → V2 → V1`

**Input**

Получена декларация, замыкающая цикл.

**Expected Result**

- Assessment фиксирует `CYCLE_DETECTED`.
- Зависимые от преемственности Grants не применяются.
- Домен MAY разрешить Read-Only взаимодействие.

**Forbidden Side Effects**

- Система не аварийно завершается.
- Участники не удаляются глобально.
- Исторические декларации не стираются.

## Category D: Cross-Spec Integration

### D-1. Runtime Independence

**Preconditions**

Зарегистрирована IdentityVersion `A@1.0.0`.

**Input**

Запущены два RuntimeInstance:

- `rt-1`;
- `rt-2`.

`rt-1` завершается с ошибкой.

**Expected Result**

Сбой `rt-1` фиксируется отдельно.

`rt-2` продолжает независимое исполнение.

**Forbidden Side Effects**

- IdentityVersion не изменяется.
- Runtime `rt-2` не объявляется аварийным.
- Полномочия версии не отзываются автоматически вследствие падения одного Runtime.

### D-2. Historical Ruling Preservation

**Preconditions**

- Credential использован для исторического действия.
- На основании соответствующих Assessment вынесен Ruling.
- Позднее Credential отозван.
- Выпущен новый Assessment, фиксирующий компрометацию.

**Input**

Регистрация CredentialRevocationRecord и нового ContinuityAssessment.

**Expected Result**

Исторический Ruling сохраняется без мутаций.

Будущая применимость полномочий определяется соответствующей политикой и актуальными проверками.

**Forbidden Side Effects**

Исторический Ruling не удаляется и не переписывается задним числом.

### D-3. Retrospective Key Compromise

**Preconditions**

Credential использован для подписи в `T=100`.

В `T=150` опубликован CredentialRevocationRecord:

```typescript
reason: "CONFIRMED_COMPROMISE",
compromise_effective_at: 80
```

Время компрометации принято локальной политикой на основании достаточных доказательств.

**Input**

Проверка Claim `PARENT_SIGNATURE_MATCH` для подписи с `signed_at=100`.

**Expected Result**

`CLAIM_FAILED_KEY_COMPROMISED_PRIOR_TO_SIGNATURE`.

**Forbidden Side Effects**

- Исходный Credential Descriptor не удаляется.
- Исторические события не стираются.
- Отзыв не изменяет исходный IdentityVersionDescriptor.

### D-4. Unknown Compromise Time

**Preconditions**

Credential отозван с причиной `CONFIRMED_COMPROMISE`, но `compromise_effective_at` отсутствует.

**Input**

Проверка исторической подписи, созданной до `revoked_at`.

**Expected Result**

Подпись переводится в `CONTESTED_COMPROMISED`.

Она не может служить достаточным основанием для подтверждения преемственности или будущей авторизации без дополнительной нормативной оценки.

**Forbidden Side Effects**

Система не предполагает автоматически, что компрометация началась в момент отзыва.

---

# 13. Forbidden Side Effects: Общие требования

Все реализации CORE-001 MUST соблюдать следующие запреты:

1. Lineage не создаёт Authority Grant.
2. Credential не создаёт Authority Grant.
3. Assessment не создаёт Authority Grant.
4. Local Acceptance не создаёт Authority Grant.
5. IdentityVersion не изменяется вследствие Runtime Lifecycle Events.
6. Исторические дескрипторы не мутируют вследствие последующих оценок.
7. Исторические Assessment не перезаписываются при Supersession.
8. Исторические Ruling не удаляются вследствие изменения оснований.
9. Отсутствие Assessment не трактуется как успешная проверка.
10. Внешнее положительное заключение не отменяет автоматически локальное отрицательное заключение.
11. Локальная оценка одного домена не навязывается другим доменам.
12. Обнаружение конфликта не требует глобального удаления Participant или IdentityVersion.

---

# 14. Границы спецификаций серии UIA-CORE

| Документ | Область | Ответственность |
|---|---|---|
| UIA-CORE-001 | Identity, Credentials, Lineage, Acceptance | Субъекты, версии, мандаты, происхождение, локальное признание |
| UIA-CORE-002 | Interaction & Event Ledger | События, Envelope, Event/Claim/Artifact Provenance, доставка и Ledger |
| UIA-CORE-003 | Authority & Execution | AuthorityPrincipal, Grants, Capabilities, JIT Authorization, Delegation, Taint Tracking |
| UIA-CORE-004 | Epistemics & Normative Acts | Evidence, Findings, Rulings, Examination, Reassessment |

## 14.1. CORE-001 и CORE-002

CORE-001 определяет сущности идентичности и происхождения.

CORE-002 определяет, как события, связанные с этими сущностями, представляются, передаются, фиксируются и обрабатываются.

Событие, подписанное валидным Credential, не становится автоматически истинным или принятым получателем.

## 14.2. CORE-001 и CORE-003

CORE-001 предоставляет идентификаторы и контекст для Authority-механизмов.

CORE-003 определяет:

- AuthorityPrincipal;
- CapabilityGrant;
- Delegation;
- Execution Authorization;
- JIT проверки;
- Taint Tracking.

Ни один объект CORE-001 сам по себе не предоставляет полномочий.

## 14.3. CORE-001 и CORE-004

CORE-001 использует Assessment как локальные эпистемические документы о происхождении.

CORE-004 определяет полноценную модель:

- Evidence;
- Finding;
- Ruling;
- Examination;
- Normative Decision;
- Reassessment.

CORE-001 не переопределяет семантику этих сущностей.

---

# 15. Открытые вопросы и ограничения

Следующие вопросы намеренно не решаются в CORE-001:

1. Универсальный формат Evidence и его проверка — CORE-004.
2. Полная структура AuthorityPrincipal — CORE-003.
3. Универсальный протокол выдачи и отзыва полномочий — CORE-003.
4. Полная модель Event Ledger и доставки — CORE-002.
5. Универсальный механизм доверенного времени.
6. Универсальный формат криптографических Credential.
7. Универсальная юридическая ответственность Participant.
8. Универсальная политика признания внешних доменов.
9. Универсальный алгоритм оценки доверия к источникам.

CORE-001 не требует блокчейна, глобального консенсуса, распределённого арбитража или единого реестра доверия.

Домены сохраняют автономию в рамках установленных семантических контрактов.

---

# 16. Критерии готовности к заморозке

CORE-001 может быть переведён из Candidate Draft Normative в Frozen Baseline только после выполнения следующих условий:

- [ ] Все структурные тесты Category A проходят.
- [ ] Все Authority Binding и Traversal тесты Category B проходят.
- [ ] Все Federation тесты Category C проходят.
- [ ] Все Cross-Spec Integration тесты Category D проходят.
- [ ] Path Discovery и Merge Closure Validation дают одинаковые результаты в независимых реализациях.
- [ ] Результат не зависит от порядка хранения и доставки данных.
- [ ] Проверены случаи отсутствующих и противоречивых Assessment.
- [ ] Проверены временные случаи Credential Revocation.
- [ ] Проверена неизменяемость исторических дескрипторов, Assessment и Ruling.
- [ ] Проведена независимая проверка семантической совместимости двух реализаций.

До выполнения этих условий статус документа остаётся Candidate Draft Normative.

---

# 17. Итоговый архитектурный принцип

`UIA-CORE-001` устанавливает минимальную модель идентичности и происхождения, которая позволяет различным участникам и доменам взаимодействовать без автоматического наследования полномочий и без навязывания универсальной оценки доверия.

Основные разграничения:

```text
Participant
    │
    ▼
IdentityVersion
    │
    ├── Credential
    │
    └── Lineage Declaration
              │
              ▼
       Lineage Assessment
              │
              ▼
        Local Acceptance
```

Отдельно:

```text
AuthorityPrincipal
       │
       ▼
  Authority Grant
       │
       ▼
Execution Authorization
```

Первая цепочка описывает идентичность, криптографические свидетельства, происхождение и локальное признание.

Вторая описывает полномочия и разрешение на исполнение действий.

Между ними нет автоматического перехода.

**UIA сохраняет происхождение утверждений, историю решений и границы полномочий, не превращаясь в механизм принудительного достижения единой истины.**
