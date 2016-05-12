# Virtual DOM

Virtual DOM simplifies the way to manage DOM mutations, just describe how your component should look at any point in
time and Virtual DOM reconciliation algorithm will make all necessary DOM operations to update component representation
in a most efficient way.

The basic Virtual DOM API that kivi provides is enough for most use cases. But when it isn't enough, kivi has many
advanced tools that can reduce Virtual DOM diffing overhead, and it will be quite hard to beat its performance without
reimplementing similar algorithms.

### Creating Virtual DOM Nodes

Kivi has several simple functions to create virtual nodes:

```
// Creates a virtual node representing a HTML Element.
function createVElement(tagName: string): VNode;

// Creates a virtual node representing a SVG Element.
function createVSvgElement(tagName: string): VNode;

// Creates a virtual node representing a Text Node.
function createVText(content: string): VNode;

// Creates a virtual node representing a Component's root element.
function createVRoot(): VNode;

// Creates a virtual node representing an Input Element with text value.
function createVTextInput(): VNode;

// Creates a virtual node representing an Input Element with checked value.
function createVCheckedInput(): VNode;
```

### Setting VNode properties

Virtual node instance has many different methods to set properties, all property methods support method chaining. For
example:

```ts
const e = createVElement("a")
  .attrs({
    "href": "localhost",
    "title": "Link to localhost",
  })
  .children("Link to localhost");
```

List of basic properties:

```
VNode.attrs(attrs: {[key: string]: any}): VNode;
VNode.props(props: {[key: string]: any}): VNode;
VNode.style(style: string): VNode;
VNode.className(className: string): VNode;
VNode.children(children: VNode[]|string): VNode;
```

### Using keys to preserve identity

To prevent from losing internal state of DOM elements and components, we should track nodes by some property. Virtual
DOM reconciliation algorithm is using `key` property to find virtual nodes representing the same DOM node from
the previous render.

To enable tracking by keys, children property should be assigned with `VNode.trackByKeyChildren(children)` method. Each
child should have a `key` property and it should be unique among its siblings. For example:

```ts
const container = createVElement("div")
  .trackByKeyChildren([
    createVElement("span").key(1).children("1"),
    createVElement("span").key(2).children("2"),
    createVElement("span").key(3).children("3"),
  ]);
```

To find minimum number of move operations, kivi reconciliation algorithm is using
[Longest Increasing Subsequence](https://en.wikipedia.org/wiki/Longest_increasing_subsequence) algorithm. It is highly
optimized and in most real world situations that involve simple moves of one or two nodes it won't perform LIS
computation. See [uibench](https://localvoid.github.io/uibench/) benchmark to find out how kivi handles different use
cases.