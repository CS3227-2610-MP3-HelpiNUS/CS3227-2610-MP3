import { createHash } from 'node:crypto'
import type {
  StudentStudyAssistantChunk,
  StudentStudyAssistantCorpusGeneration,
} from './studentStudyAssistantRetrieval.js'

const approvedAt = '2026-10-21T00:00:00.000Z'
const approvedBy = 'ZHENG_HAO_SOURCE_SELECTION_2026_10_21'
const generation = 'nus-cs2030s-2021-s2_cs2103-ay2526s1-v1'

const contentHash = (content: string) =>
  createHash('sha256').update(content.normalize('NFKC'), 'utf8').digest('hex')

function chunk(
  chunkId: string,
  sourceId: string,
  title: string,
  canonicalUrl: string,
  version: string,
  section: string,
  content: string,
  keywords: ReadonlyArray<string>,
): StudentStudyAssistantChunk {
  return {
    chunkId,
    sourceId,
    title,
    canonicalUrl,
    version,
    section,
    content,
    contentHash: contentHash(content),
    approvedBy,
    approvedAt,
    accessClassification: 'ALL_ACTIVE_STUDENTS',
    reviewState: 'APPROVED',
    keywords,
  }
}

const cs2030sTitle = 'CS2030S Programming Methodology II'
const cs2030sVersion = '2021 Semester 2'
const cs2030sBase = 'https://nus-cs2030s.github.io/2021-s2/'

const cs2103Title = 'CS2103/T Software Engineering Textbook'
const cs2103Version = 'AY2025/26 Semester 1'
const cs2103Base = 'https://nus-cs2103-ay2526s1.github.io/website/se-book-adapted/'

const chunks: ReadonlyArray<StudentStudyAssistantChunk> = [
  chunk(
    'cs2030s-overview', 'cs2030s-2021-s2-overview', cs2030sTitle, `${cs2030sBase}00-overview.html`,
    cs2030sVersion, 'Module aims and taming complexity',
    'CS2030S prepares students to build larger software that evolves and is maintained by multiple programmers. Its recurring theme is taming complexity through abstraction, object-oriented and functional programming, type safety, limited side effects, and code that remains readable and adaptable.',
    ['cs2030s', '2030s', 'overview', 'complexity', 'abstraction', 'maintainability', 'software'],
  ),
  chunk(
    'cs2030s-java-paradigms', 'cs2030s-2021-s2-overview', cs2030sTitle, `${cs2030sBase}00-overview.html`,
    cs2030sVersion, 'Java, objects, types, and functions',
    'CS2030S uses Java because it is statically and strongly typed and supports both object-oriented and functional styles. The module focuses on programming principles and language constructs rather than comprehensive Java syntax, with objects, types, and functions as central tools for controlling software complexity.',
    ['cs2030s', '2030s', 'java', 'objects', 'types', 'functions', 'functional', 'oop', 'paradigms'],
  ),
  chunk(
    'cs2030s-encapsulation', 'cs2030s-2021-s2-encapsulation', cs2030sTitle, `${cs2030sBase}04-encapsulation.html`,
    cs2030sVersion, 'Encapsulation and reference types',
    'Encapsulation groups data fields and the methods that operate on them inside a class and places their representation behind an abstraction barrier. Objects are instances of classes; Java class values are references, so two variables may refer to the same object, while an uninitialized reference can lead to a null-related runtime failure.',
    ['cs2030s', '2030s', 'encapsulation', 'class', 'object', 'fields', 'methods', 'reference', 'null'],
  ),
  chunk(
    'cs2030s-composition-inheritance', 'cs2030s-2021-s2-inheritance', cs2030sTitle, `${cs2030sBase}10-inheritance.html`,
    cs2030sVersion, 'Composition and inheritance',
    'Composition builds a class from other objects and models a has-a relationship. Inheritance extends a superclass and models a genuine is-a and subtype relationship; it should preserve the parent abstraction and is inappropriate when substituting the child would give the parent operations a surprising meaning.',
    ['cs2030s', '2030s', 'composition', 'inheritance', 'extends', 'superclass', 'subclass', 'subtype'],
  ),
  chunk(
    'cs2030s-polymorphism', 'cs2030s-2021-s2-polymorphism', cs2030sTitle, `${cs2030sBase}12-polymorphism.html`,
    cs2030sVersion, 'Polymorphism and dynamic binding',
    'Overriding enables polymorphism: the same method call can invoke different implementations according to the runtime type of the receiving object. This dynamic binding lets existing client code work with new subtype behavior without changing the client, while equality behavior may require a deliberate equals-method override.',
    ['cs2030s', '2030s', 'polymorphism', 'overriding', 'dynamic', 'binding', 'runtime', 'equals'],
  ),
  chunk(
    'cs2030s-lsp', 'cs2030s-2021-s2-lsp', cs2030sTitle, `${cs2030sBase}13-lsp.html`,
    cs2030sVersion, 'Liskov Substitution Principle',
    'The Liskov Substitution Principle requires subtype objects to remain usable wherever the parent type is expected without breaking the expected behavior. Inheritance and overriding therefore carry behavioral responsibilities; Java final classes or methods can prevent extension or overriding when that contract should not be changed.',
    ['cs2030s', '2030s', 'liskov', 'substitution', 'lsp', 'subtype', 'inheritance', 'final'],
  ),
  chunk(
    'cs2030s-generics', 'cs2030s-2021-s2-generics', cs2030sTitle, `${cs2030sBase}20-generics.html`,
    cs2030sVersion, 'Generic types and methods',
    'Generics parameterize classes and methods with types. Type parameters and type arguments let one implementation work with multiple data types, reducing duplicated code while preserving compile-time type safety; bounded type parameters restrict the acceptable type arguments when an operation needs specific capabilities.',
    ['cs2030s', '2030s', 'generics', 'generic', 'parameterized', 'parameters', 'arguments', 'bounded', 'safety'],
  ),
  chunk(
    'cs2030s-wildcards', 'cs2030s-2021-s2-wildcards', cs2030sTitle, `${cs2030sBase}23-wildcard.html`,
    cs2030sVersion, 'Wildcards and PECS',
    'Java wildcards make generic APIs accept a controlled range of related types. An upper-bounded wildcard is useful when a value is a producer, a lower-bounded wildcard is useful when it is a consumer, and the PECS mnemonic summarizes this choice as producer extends and consumer super.',
    ['cs2030s', '2030s', 'wildcard', 'wildcards', 'pecs', 'covariant', 'contravariant', 'producer', 'consumer'],
  ),
  chunk(
    'cs2030s-immutability', 'cs2030s-2021-s2-immutability', cs2030sTitle, `${cs2030sBase}25-immutability.html`,
    cs2030sVersion, 'Immutability and aliasing',
    'An immutable object has no externally visible state change after construction. Immutability reduces aliasing surprises when references are shared, makes behavior easier to reason about, and complements pure functions by ensuring the same inputs continue to produce the same observable result.',
    ['cs2030s', '2030s', 'immutability', 'immutable', 'aliasing', 'pure', 'state', 'sideeffects'],
  ),
  chunk(
    'cs2030s-lazy', 'cs2030s-2021-s2-lazy', cs2030sTitle, `${cs2030sBase}29-lazy.html`,
    cs2030sVersion, 'Lazy evaluation and memoization',
    'Lazy evaluation delays a computation until its result is needed. A zero-argument lambda can represent the delayed work, while memoization lets a Lazy abstraction evaluate the expression at most once and reuse the stored result on later requests.',
    ['cs2030s', '2030s', 'lazy', 'evaluation', 'memoization', 'lambda', 'delayed', 'producer'],
  ),
  chunk(
    'cs2030s-streams', 'cs2030s-2021-s2-streams', cs2030sTitle, `${cs2030sBase}31-stream.html`,
    cs2030sVersion, 'Java streams',
    'Java streams form processing pipelines from a source, intermediate operations such as mapping or filtering, and a terminal operation that produces a result or effect. Streams are consumed once; flatMap handles nested stream-producing transformations, while stateful or unbounded operations require care, especially with infinite data.',
    ['cs2030s', '2030s', 'stream', 'streams', 'map', 'filter', 'flatmap', 'terminal', 'pipeline', 'infinite'],
  ),
  chunk(
    'cs2030s-loggable-monad', 'cs2030s-2021-s2-loggable', cs2030sTitle, `${cs2030sBase}32-logger.html`,
    cs2030sVersion, 'Loggable values and flatMap',
    'The Loggable example pairs a computed value with accumulated information about the computation. flatMap composes operations that each return a wrapped result, threading the additional context through the sequence without forcing every operation to manually unpack and rebuild the wrapper.',
    ['cs2030s', '2030s', 'loggable', 'logging', 'flatmap', 'monad', 'wrapped', 'composition'],
  ),
  chunk(
    'cs2030s-threads-async', 'cs2030s-2021-s2-threads-async', cs2030sTitle, `${cs2030sBase}36-async.html`,
    cs2030sVersion, 'Threads and asynchronous programming',
    'A thread is one flow of execution and can keep work progressing while another operation blocks. Direct thread coordination becomes difficult for dependent tasks and error handling, so CompletableFuture provides a higher-level asynchronous abstraction for creating, chaining, combining, retrieving, and recovering computations.',
    ['cs2030s', '2030s', 'thread', 'threads', 'asynchronous', 'async', 'completablefuture', 'concurrency', 'blocking'],
  ),

  chunk(
    'cs2103-overview', 'cs2103-ay2526s1-index', cs2103Title, `${cs2103Base}index.html`,
    cs2103Version, 'Module knowledge map',
    'CS2103 studies software engineering across requirements, design, implementation, quality assurance, revision control, process models, planning, and teamwork. Its textbook connects these topics to building and evolving non-trivial software products in individual and team projects.',
    ['cs2103', '2103', 'cs2103t', 'software', 'engineering', 'overview', 'requirements', 'design', 'testing', 'teamwork'],
  ),
  chunk(
    'cs2103-requirements', 'cs2103-ay2526s1-requirements', cs2103Title, `${cs2103Base}chapters/requirements.html`,
    cs2103Version, 'Functional and non-functional requirements',
    'A software requirement states a need the product must fulfil and originates from stakeholders who are involved in or affected by the project. Functional requirements describe what the system should do, while non-functional requirements constrain qualities or operating conditions such as performance, security, usability, compatibility, and data needs.',
    ['cs2103', '2103', 'requirements', 'requirement', 'functional', 'nonfunctional', 'stakeholders', 'constraints'],
  ),
  chunk(
    'cs2103-gathering-requirements', 'cs2103-ay2526s1-gathering-requirements', cs2103Title, `${cs2103Base}chapters/gatheringRequirements.html`,
    cs2103Version, 'Gathering requirements',
    'Requirements can be gathered through complementary techniques. Brainstorming prioritizes generating many diverse ideas before validation, surveys collect input from many stakeholders, and observation or usage data reveals needs and mistakes in the users actual environment.',
    ['cs2103', '2103', 'gathering', 'elicitation', 'brainstorming', 'surveys', 'observation', 'stakeholders'],
  ),
  chunk(
    'cs2103-specifying-requirements', 'cs2103-ay2526s1-specifying-requirements', cs2103Title, `${cs2103Base}chapters/specifyingRequirements.html`,
    cs2103Version, 'Specifying requirements',
    'Requirements may be expressed using short prose for high-level ideas and visions, or structured representations such as prioritized feature lists. Long prose is difficult to follow, so the representation should make scope, organization, and intended behavior clear enough for stakeholders and developers to review.',
    ['cs2103', '2103', 'specification', 'specifying', 'prose', 'features', 'vision', 'scope', 'priorities'],
  ),
  chunk(
    'cs2103-design-fundamentals', 'cs2103-ay2526s1-design-fundamentals', cs2103Title, `${cs2103Base}chapters/designFundamentals.html`,
    cs2103Version, 'Abstraction in software design',
    'Abstraction manages complexity by selecting the level relevant to a task and suppressing lower-level details. Data abstraction lets a component reason about larger entities rather than their fields, while control abstraction lets it reason about higher-level operations rather than every execution step.',
    ['cs2103', '2103', 'design', 'abstraction', 'complexity', 'data', 'control', 'fundamentals'],
  ),
  chunk(
    'cs2103-modeling', 'cs2103-ay2526s1-modeling', cs2103Title, `${cs2103Base}chapters/modeling.html`,
    cs2103Version, 'Models and UML',
    'A software model is a deliberately simplified representation of selected aspects of a system. Class diagrams model structure rather than behavior, and multiple UML or architecture models may be needed to analyze a system and communicate different views to developers, customers, and other stakeholders.',
    ['cs2103', '2103', 'model', 'modeling', 'uml', 'diagram', 'class', 'structure', 'behavior'],
  ),
  chunk(
    'cs2103-architecture', 'cs2103-ay2526s1-architecture', cs2103Title, `${cs2103Base}chapters/architecture.html`,
    cs2103Version, 'Software architecture',
    'Software architecture describes the systems high-level structure: its software elements, their externally visible properties, and their relationships. It should provide a simple, technically viable organization of interacting components that the team understands and can use as the basis for implementation.',
    ['cs2103', '2103', 'architecture', 'components', 'interfaces', 'structure', 'relationships', 'implementation'],
  ),
  chunk(
    'cs2103-design-patterns', 'cs2103-ay2526s1-design-patterns', cs2103Title, `${cs2103Base}chapters/designPatterns.html`,
    cs2103Version, 'Software design patterns',
    'A design pattern is a reusable solution to a recurring software-design problem in a particular context. A pattern explains the context and problem as well as the solution and its consequences, helping teams reuse design knowledge rather than copy one rigid implementation.',
    ['cs2103', '2103', 'design', 'patterns', 'pattern', 'reusable', 'context', 'solution', 'consequences'],
  ),
  chunk(
    'cs2103-code-quality', 'cs2103-ay2526s1-code-quality', cs2103Title, `${cs2103Base}chapters/codeQuality.html`,
    cs2103Version, 'Code quality and readability',
    'Readable code is easier for future developers, including the original author, to understand and modify. Code-quality practices include keeping methods focused, naming elements clearly, avoiding unnecessary nesting and duplication, and organizing logic so that the intent is easier to see and maintain.',
    ['cs2103', '2103', 'code', 'quality', 'readability', 'methods', 'naming', 'nesting', 'duplication', 'maintainability'],
  ),
  chunk(
    'cs2103-refactoring', 'cs2103-ay2526s1-refactoring', cs2103Title, `${cs2103Base}chapters/refactoring.html`,
    cs2103Version, 'Refactoring',
    'Refactoring restructures code through small steps without changing its externally observable behavior. It differs from rewriting, bug fixing, or adding a feature; its purpose is to improve internal quality while frequent checks protect the existing behavior.',
    ['cs2103', '2103', 'refactoring', 'restructuring', 'behavior', 'rewriting', 'quality', 'incremental'],
  ),
  chunk(
    'cs2103-testing', 'cs2103-ay2526s1-testing', cs2103Title, `${cs2103Base}chapters/testing.html`,
    cs2103Version, 'Testing fundamentals',
    'Testing operates a system under specified conditions, observes the result, and evaluates an aspect of the system. A test case identifies at least the input and expected behavior; a mismatch between expected and actual behavior indicates a potential defect, although the test itself can also be wrong.',
    ['cs2103', '2103', 'testing', 'test', 'cases', 'input', 'expected', 'actual', 'failure', 'defect'],
  ),
  chunk(
    'cs2103-test-case-design', 'cs2103-ay2526s1-test-case-design', cs2103Title, `${cs2103Base}chapters/testCaseDesign.html`,
    cs2103Version, 'Test case design',
    'Exhaustive testing is generally impractical because input combinations and execution situations grow too large. Test cases should therefore be selected deliberately to use testing resources well, including representative partitions, boundaries, invalid cases, and combinations that are likely to reveal distinct classes of defects.',
    ['cs2103', '2103', 'testcase', 'test', 'cases', 'testing', 'exhaustive', 'partition', 'boundary', 'invalid', 'defects', 'coverage'],
  ),
  chunk(
    'cs2103-revision-control', 'cs2103-ay2526s1-revision-control', cs2103Title, `${cs2103Base}chapters/gitAndGithub.html`,
    cs2103Version, 'Revision control with Git and GitHub',
    'Revision control records the history and evolution of project files, supports collaboration and conflict resolution, enables recovery from mistakes, and manages multiple versions. In Git, the working directory contains editable files, the staging area prepares the next snapshot, and a commit records that selected snapshot in repository history.',
    ['cs2103', '2103', 'git', 'github', 'revision', 'version', 'control', 'staging', 'commit', 'repository'],
  ),
  chunk(
    'cs2103-process-planning-teamwork', 'cs2103-ay2526s1-index', cs2103Title, `${cs2103Base}index.html`,
    cs2103Version, 'Process, planning, and teamwork',
    'CS2103 treats software delivery as an iterative team activity that combines process choices, project planning, revision control, communication, and quality checks. These concerns coordinate requirements, design, implementation, testing, and releases so that a team can evolve a product while keeping its work visible and reviewable.',
    ['cs2103', '2103', 'process', 'sdlc', 'planning', 'teamwork', 'iteration', 'communication', 'release'],
  ),
]

export const nusComputingStudentStudyAssistantGeneration: StudentStudyAssistantCorpusGeneration = {
  generation,
  allowedUrlPrefixes: [cs2030sBase, cs2103Base],
  chunks,
}
