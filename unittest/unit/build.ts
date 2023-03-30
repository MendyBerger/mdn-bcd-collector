//
// mdn-bcd-collector: unittest/unit/build.ts
// Unittest for the test build script
//
// © Gooborg Studios, Google LLC, Apple Inc
// See the LICENSE file for copyright details
//

import chai, {assert} from 'chai';
import chaiSubset from 'chai-subset';
chai.use(chaiSubset);

import * as WebIDL2 from 'webidl2';
import sinon from 'sinon';

import {
  flattenIDL,
  getExposureSet,
  compileTestCode,
  compileTest,
  validateIDL,
  buildIDLTests,
  buildIDL,
  getCustomTestData,
  getCustomTest,
  getCustomTestAPI,
  getCustomSubtestsAPI,
  buildCSS,
  getCustomTestCSS,
  buildJS
} from '../../build.js';

import type {RawTest} from '../../types/types.js';

describe('build', () => {
  describe('getCustomTest(Data)', () => {
    const expectedResults = {
      'api.FooBar': [
        {
          __base: "'hello world';",
          __test: "return 'hello world!';",
          __resources: []
        },
        {
          test: '(function () {\n  "hello world";\n  return "hello world!";\n})();\n',
          resources: {}
        }
      ],
      'api.FooBar.foo': [
        {
          __base: "'hello world';",
          __test: "return 'hi, world!';",
          __resources: []
        },
        {
          test: '(function () {\n  "hello world";\n  return "hi, world!";\n})();\n',
          resources: {}
        }
      ],
      'api.FooBar.foo.pear': [
        {
          __base: "'hello world';",
          __test: false,
          __resources: []
        },
        // XXX Not accurate
        {test: '(function () {\n  "hello world";\n})();\n', resources: {}}
      ],
      'api.FooBar.bar': [
        {
          __base: "'hello world';\n'goodbye world';",
          __test: "return 'farewell world!';",
          __resources: []
        },
        {
          test: '(function () {\n  "hello world";\n  "goodbye world";\n  return "farewell world!";\n})();\n',
          resources: {}
        }
      ],
      'api.FooBar.bar.cinnamon': [
        {
          __base: "'hello world';\n'goodbye world';",
          __test: false,
          __resources: []
        },
        // XXX Not accurate
        {
          test: '(function () {\n  "hello world";\n  "goodbye world";\n})();\n',
          resources: {}
        }
      ],
      'api.FooBar.baz': [
        {
          __base: "'hello world';",
          __test: false,
          __resources: []
        },
        // XXX Not accurate
        {test: '(function () {\n  "hello world";\n})();\n', resources: {}}
      ],
      'api.Chocolate': [
        {
          __base: false,
          __test: false,
          __resources: []
        },
        {test: false, resources: {}}
      ],
      'api.audiocontext': [
        {
          __base: false,
          __test: 'return false;',
          __resources: ['audio-blip']
        },
        {
          test: '(function () {\n  return false;\n})();\n',
          resources: {
            'audio-blip': {
              type: 'audio',
              src: ['/media/blip.mp3', '/media/blip.ogg']
            }
          }
        }
      ],
      'api.WebGLRenderingContext': [
        {
          __base: 'return reusableInstances.webGL;',
          __test: false,
          __resources: ['webGL']
        },
        {
          // XXX Not accurate
          test: '(function () {\n  return reusableInstances.webGL;\n})();\n',
          resources: {
            webGL: {
              type: 'instance',
              src: `var canvas = document.createElement('canvas');
if (!canvas) {
  return false;
};
return canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');`
            }
          }
        }
      ]
    };

    for (const [k, v] of Object.entries(expectedResults)) {
      it(k, () => {
        assert.deepEqual(getCustomTestData(k), v[0]);
        assert.deepEqual(getCustomTest(k), v[1]);
      });
    }

    it('api.badresource (throw error on bad resource reference)', () => {
      assert.throws(
        () => {
          getCustomTest('api.badresource');
        },
        Error,
        'Resource bad-resource is not defined but referenced in api.badresource'
      );
    });
  });

  describe('getCustomTestAPI', () => {
    beforeEach(() => {
      sinon.stub(console, 'error');
    });

    describe('no custom tests', () => {
      it('interface', () => {
        assert.equal(getCustomTestAPI('nonexistent'), false);
      });

      it('member', () => {
        assert.equal(getCustomTestAPI('nonexistent', 'ghost'), false);
      });
    });

    describe('custom test for interface and member', () => {
      it('interface', () => {
        assert.equal(
          getCustomTestAPI('foo'),
          `(function () {
  var instance = 1;
  return instance + 4;
})();
`
        );
      });

      it('member (custom)', () => {
        assert.equal(
          getCustomTestAPI('foo', 'bar'),
          `(function () {
  var instance = 1;
  return 1 + 1;
})();
`
        );
      });

      it('member (default)', () => {
        assert.equal(
          getCustomTestAPI('foo', 'baz'),
          `(function () {
  var instance = 1;
  return !!instance && "baz" in instance;
})();
`
        );
      });

      it('constructor', () => {
        assert.equal(getCustomTestAPI('foo', 'foo', 'constructor'), false);
      });

      it('symbol', () => {
        assert.equal(
          getCustomTestAPI('foo', '@@bar', 'symbol'),
          `(function () {
  var instance = 1;
  return (
    !!instance && "Symbol" in self && "bar" in Symbol && Symbol.bar in instance
  );
})();
`
        );
      });
    });

    describe('custom test for interface only, no base', () => {
      it('interface', () => {
        assert.equal(
          getCustomTestAPI('fig'),
          `(function () {
  return 2;
})();
`
        );
      });

      it('member', () => {
        assert.equal(getCustomTestAPI('fig', 'ghost'), false);
      });
    });

    describe('custom test for member only', () => {
      it('interface', () => {
        assert.equal(
          getCustomTestAPI('apple'),
          `(function () {
  var a = 1;
  return !!instance;
})();
`
        );
      });

      it('member', () => {
        assert.equal(
          getCustomTestAPI('apple', 'bar'),
          `(function () {
  var a = 1;
  return a + 3;
})();
`
        );
      });
    });

    describe('promise-based custom tests', () => {
      it('interface', () => {
        assert.equal(
          getCustomTestAPI('promise'),
          `(function () {
  var promise = somePromise();
  if (!promise) {
    return { result: false, message: "Promise variable is falsy" };
  }
  return promise.then(function (instance) {
    return !!instance;
  });
})();
`
        );
      });

      it('member', () => {
        assert.equal(
          getCustomTestAPI('promise', 'bar'),
          `(function () {
  var promise = somePromise();
  if (!promise) {
    return { result: false, message: "Promise variable is falsy" };
  }
  return promise.then(function (instance) {
    return !!instance && "bar" in instance;
  });
})();
`
        );
      });

      it('interface with import', () => {
        assert.equal(
          getCustomTestAPI('newpromise'),
          `(function () {
  var p = somePromise();
  if (!p) {
    return { result: false, message: "p is falsy" };
  }
  var promise = p.then(function () {});
  if (!promise) {
    return { result: false, message: "Promise variable is falsy" };
  }
  return promise.then(function (instance) {
    return !!instance;
  });
})();
`
        );
      });
    });

    describe('callback-based custom tests', () => {
      it('interface', () => {
        assert.equal(
          getCustomTestAPI('callback'),
          `(function () {
  function onsuccess(res) {
    callback(res.result);
  }
  function callback(instance) {
    try {
      success(!!instance);
    } catch (e) {
      fail(e);
    }
  }
  return "callback";
})();
`
        );
      });

      it('member', () => {
        assert.equal(
          getCustomTestAPI('callback', 'bar'),
          `(function () {
  function onsuccess(res) {
    callback(res.result);
  }
  function callback(instance) {
    try {
      success(!!instance && "bar" in instance);
    } catch (e) {
      fail(e);
    }
  }
  return "callback";
})();
`
        );
      });

      it('interface with import', () => {
        assert.equal(
          getCustomTestAPI('newcallback'),
          `(function () {
  function onsuccess(res) {
    c(res.result);
  }
  function c(result) {
    callback(result);
  }
  function callback(instance) {
    try {
      success(!!instance);
    } catch (e) {
      fail(e);
    }
  }
  return "callback";
})();
`
        );
      });
    });

    describe('import other test', () => {
      it('valid import', () => {
        assert.equal(
          getCustomTestAPI('import1'),
          `(function () {
  var a = 1;
  if (!a) {
    return { result: false, message: "a is falsy" };
  }
  var instance = a;
  return !!instance;
})();
`
        );
      });

      it('valid import: two imports', () => {
        assert.equal(
          getCustomTestAPI('import2'),
          `(function () {
  var a = 1;
  if (!a) {
    return { result: false, message: "a is falsy" };
  }
  var b = a;
  if (!b) {
    return { result: false, message: "b is falsy" };
  }
  var instance = b;
  return !!instance;
})();
`
        );
      });

      it('valid import: import is instance', () => {
        assert.equal(
          getCustomTestAPI('straightimport'),
          `(function () {
  var instance = 1;
  return !!instance;
})();
`
        );
      });

      it('invalid import: 1st', () => {
        assert.equal(
          getCustomTestAPI('badimport'),
          `(function () {
  throw "Test is malformed: <%api.foobar:apple%> is an invalid import reference";
  return !!instance;
})();
`
        );
        assert.isTrue((console.error as any).calledOnce);
      });

      it('invalid import: 2nd', () => {
        assert.equal(
          getCustomTestAPI('badimport2'),
          `(function () {
  throw "Test is malformed: <%api.foobar.bar:apple%> is an invalid import reference";
  return !!instance;
})();
`
        );
        assert.isTrue((console.error as any).calledOnce);
      });

      it('bad syntax', () => {
        assert.isTrue(
          (getCustomTestAPI('syntaxerror') as string).includes(
            'throw "Test is malformed:'
          )
        );
        assert.isTrue((console.error as any).calledOnce);
      });
    });

    afterEach(() => {
      (console.error as any).restore();
    });
  });

  describe('getCustomSubtestsAPI', () => {
    it('get subtests', () => {
      assert.deepEqual(getCustomSubtestsAPI('foo'), {
        multiple: `(function () {
  var instance = 1;
  return 1 + 1 + 1;
})();
`,
        'one.only': `(function () {
  var instance = 1;
  return 1;
})();
`
      });
    });
  });

  describe('getCustomTestCSS', () => {
    it('no custom tests', () => {
      assert.equal(getCustomTestCSS('ghost'), false);
    });

    it('custom test for property', () => {
      assert.equal(
        getCustomTestCSS('foo'),
        `(function () {
  return 1;
})();
`
      );
    });
  });

  describe('compileTestCode', () => {
    it('string', () => {
      assert.equal(compileTestCode('a string'), 'a string');
    });

    it('constructor', () => {
      const test = {
        property: 'constructor.AudioContext',
        owner: 'AudioContext'
      };
      assert.equal(
        compileTestCode(test),
        'bcd.testConstructor("AudioContext");'
      );
    });

    it('Symbol', () => {
      const test = {property: 'Symbol.iterator', owner: 'DOMMatrixReadOnly'};
      assert.equal(
        compileTestCode(test),
        '"Symbol" in self && "iterator" in Symbol && "DOMMatrixReadOnly" in self && Symbol.iterator in DOMMatrixReadOnly.prototype'
      );
    });

    it('namespace', () => {
      const test = {property: 'log', owner: 'console'};
      assert.equal(
        compileTestCode(test),
        '"console" in self && "log" in console'
      );
    });

    it('constructor', () => {
      const test = {
        property: 'm11',
        owner: 'DOMMatrix.prototype',
        inherit: true
      };
      assert.equal(
        compileTestCode(test),
        '"DOMMatrix" in self && Object.prototype.hasOwnProperty.call(DOMMatrix.prototype, "m11")'
      );
    });
  });

  describe('compileTest', () => {
    it('main', () => {
      const rawTest: RawTest = {
        raw: {
          code: {property: 'body', owner: `Document.prototype`}
        },
        resources: {
          'audio-blip': {
            type: 'audio',
            src: ['/media/blip.mp3', '/media/blip.ogg']
          }
        },
        exposure: ['Window']
      };

      assert.deepEqual(compileTest(rawTest), {
        code: '"Document" in self && "body" in Document.prototype',
        exposure: ['Window'],
        resources: {
          'audio-blip': {
            type: 'audio',
            src: ['/media/blip.mp3', '/media/blip.ogg']
          }
        }
      });
    });

    describe('custom tests', () => {
      it('one item', () => {
        const rawTest: RawTest = {
          raw: {
            code: 'foo',
            combinator: '&&'
          },
          resources: {},
          exposure: ['Window']
        };

        assert.deepEqual(compileTest(rawTest), {
          code: 'foo',
          exposure: ['Window']
        });
      });

      it('two items', () => {
        const rawTest: RawTest = {
          raw: {
            code: ['foo', 'foo'],
            combinator: '&&'
          },
          resources: {},
          exposure: ['Window']
        };

        assert.deepEqual(compileTest(rawTest), {
          code: 'foo && foo',
          exposure: ['Window']
        });
      });
    });

    it('no-repeated test code', () => {
      const rawTests: RawTest[] = [
        {
          raw: {
            code: 'true',
            combinator: '&&'
          },
          resources: {},
          exposure: ['Window']
        },
        {
          raw: {
            code: ['true', 'true'],
            combinator: '||'
          },
          resources: {},
          exposure: ['Window']
        },
        {
          raw: {
            code: ['true', 'true'],
            combinator: '&&'
          },
          resources: {},
          exposure: ['Worker']
        }
      ];

      assert.deepEqual(compileTest(rawTests[0]), {
        code: 'true',
        exposure: ['Window']
      });
      assert.deepEqual(compileTest(rawTests[1]), {
        code: 'true || true',
        exposure: ['Window']
      });
      assert.deepEqual(compileTest(rawTests[2]), {
        code: 'true && true',
        exposure: ['Worker']
      });
    });

    it('CSS', () => {
      const rawTest: RawTest = {
        raw: {
          code: [
            {property: 'fontFamily', owner: 'document.body.style'},
            {property: 'font-family', owner: 'document.body.style'}
          ],
          combinator: '||'
        },
        resources: {},
        exposure: ['Window']
      };

      assert.deepEqual(compileTest(rawTest), {
        code: '"fontFamily" in document.body.style || "font-family" in document.body.style',
        exposure: ['Window']
      });
    });
  });

  it('buildIDL', () => {
    const specIDLs = {
      first: WebIDL2.parse(
        `[Global=Window, Exposed=Window] interface Window {};
        [Exposed=Window] interface DOMError {};`
      ),
      second: WebIDL2.parse(`[Exposed=Window] interface XSLTProcessor {};`)
    };

    const customIDLs = {
      second: WebIDL2.parse(
        `partial interface XSLTProcessor { undefined reset(); };`
      )
    };

    const tests = buildIDL(specIDLs, customIDLs);
    assert.containsAllKeys(tests, ['api.XSLTProcessor.reset']);
  });

  describe('flattenIDL', () => {
    const customIDLs = {
      first: WebIDL2.parse(`[Exposed=Window] interface DOMError {};`),
      second: WebIDL2.parse(`[Exposed=Window] interface XSLTProcessor {};`)
    };

    it('interface + mixin', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=Window]
             interface DummyError : Error {
               readonly attribute boolean imadumdum;
             };`
        ),
        second: WebIDL2.parse(
          `[Exposed=Window]
             interface mixin DummyErrorHelper {
               DummyError geterror();
             };

             DummyError includes DummyErrorHelper;`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);

      const interfaces = ast.filter(
        (dfn) => dfn.type === 'interface'
      ) as WebIDL2.InterfaceType[];
      assert.lengthOf(interfaces, 3);

      assert.equal(interfaces[0].name, 'DummyError');
      assert.lengthOf(interfaces[0].members, 2);
      (assert as any).containSubset(interfaces[0].members[0], {
        type: 'attribute',
        name: 'imadumdum'
      });
      (assert as any).containSubset(interfaces[0].members[1], {
        type: 'operation',
        name: 'geterror'
      });

      assert.equal(interfaces[1].name, 'DOMError');
      assert.equal(interfaces[2].name, 'XSLTProcessor');
    });

    it('namespace + partial namespace', () => {
      const specIDLs = {
        cssom: WebIDL2.parse(
          `[Exposed=Window]
             namespace CSS {
               boolean supports();
             };`
        ),
        paint: WebIDL2.parse(
          `partial namespace CSS {
               readonly attribute any paintWorklet;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);

      const namespaces = ast.filter(
        (dfn) => dfn.type === 'namespace'
      ) as WebIDL2.NamespaceType[];
      assert.lengthOf(namespaces, 1);
      const [namespace] = namespaces;
      assert.equal(namespace.name, 'CSS');
      assert.lengthOf(namespace.members, 2);
      (assert as any).containSubset(namespace.members[0], {
        type: 'operation',
        name: 'supports'
      });
      (assert as any).containSubset(namespace.members[1], {
        type: 'attribute',
        name: 'paintWorklet'
      });

      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      assert.lengthOf(interfaces, 2);
    });

    it('WindowOrWorkerGlobalScope remains separate', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=Window]
             interface Window {
               readonly attribute boolean imadumdum;
             };`
        ),
        second: WebIDL2.parse(
          `[Exposed=Window]
             interface mixin WindowOrWorkerGlobalScope {
               undefined atob();
             };

             Window includes WindowOrWorkerGlobalScope;`
        )
      };
      const {ast, globals} = flattenIDL(specIDLs, customIDLs) as {
        ast: WebIDL2.InterfaceType[];
        globals: WebIDL2.InterfaceType[];
      };
      assert.lengthOf(ast, 3);
      assert.lengthOf(globals, 1);

      // Window shouldn't include any of WindowOrWorkerGlobalScope's members
      // in this case; WindowOrWorkerGlobalScope remaps to _globals
      assert.lengthOf(ast[0].members, 1);

      assert.equal(globals[0].name, 'WindowOrWorkerGlobalScope');
      assert.lengthOf(globals[0].members, 1);
      (assert as any).containSubset(globals[0].members[0], {
        type: 'operation',
        name: 'atob'
      });
    });

    it('mixin missing', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `interface mixin DummyErrorHelper {
               DummyError geterror();
             };`
        ),
        secnd: WebIDL2.parse(`DummyError includes DummyErrorHelper;`)
      };

      assert.throws(() => {
        flattenIDL(specIDLs, customIDLs);
      }, 'Target DummyError not found for interface mixin DummyErrorHelper');
    });

    it('interface missing', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=Window]
             interface DummyError : Error {
               readonly attribute boolean imadumdum;
             };`
        ),
        secnd: WebIDL2.parse(`DummyError includes DummyErrorHelper;`)
      };

      assert.throws(() => {
        flattenIDL(specIDLs, customIDLs);
      }, 'Interface mixin DummyErrorHelper not found for target DummyError');
    });

    it('Operation overloading', () => {
      const specIDLs = {
        cssom: WebIDL2.parse(
          `[Exposed=Window]
             namespace CSS {
               boolean supports();
             };`
        ),
        paint: WebIDL2.parse(
          `partial namespace CSS {
               readonly attribute any paintWorklet;
             };`
        ),
        paint2: WebIDL2.parse(
          `partial namespace CSS {
               boolean supports();
             };`
        )
      };
      assert.throws(() => {
        flattenIDL(specIDLs, customIDLs);
      }, 'Duplicate definition of CSS.supports');
    });

    it('Partial missing main', () => {
      const specIDLs = {
        paint: WebIDL2.parse(
          `partial namespace CSS {
               readonly attribute any paintWorklet;
             };`
        )
      };
      assert.throws(() => {
        flattenIDL(specIDLs, customIDLs);
      }, 'Original definition not found for partial namespace CSS');
    });
  });

  describe('getExposureSet', () => {
    // Combining spec and custom IDL is not important to these tests.
    const customIDLs = {};
    const scopes = new Set([
      'Window',
      'Worker',
      'SharedWorker',
      'ServiceWorker',
      'AudioWorklet',
      'RTCIdentityProvider'
    ]);

    it('no defined exposure set', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      assert.throws(
        () => {
          getExposureSet(interfaces[0], scopes);
        },
        Error,
        'Exposed extended attribute not found on interface Dummy'
      );
    });

    it('invalid exposure set', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=40]
          interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      assert.throws(
        () => {
          getExposureSet(interfaces[0], []);
        },
        Error,
        'Unexpected RHS "integer" for Exposed extended attribute'
      );
    });

    it('single exposure', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=Worker]
             interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      const exposureSet = getExposureSet(interfaces[0], scopes);
      assert.hasAllKeys(exposureSet, ['Worker']);
    });

    it('multiple exposure', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=(Window,Worker)]
             interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      const exposureSet = getExposureSet(interfaces[0], scopes);
      assert.hasAllKeys(exposureSet, ['Window', 'Worker']);
    });

    it('wildcard exposure', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=*]
             interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      const exposureSet = getExposureSet(interfaces[0], scopes);
      assert.hasAllKeys(exposureSet, [...scopes]);
    });

    it('DedicatedWorker remaps to Worker', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=DedicatedWorker]
             interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      const exposureSet = getExposureSet(interfaces[0], scopes);
      assert.hasAllKeys(exposureSet, ['Worker']);
    });

    it('Special case for RTCIdentityProviderGlobalScope', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=RTCIdentityProviderGlobalScope]
             interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      const exposureSet = getExposureSet(interfaces[0], scopes);
      assert.hasAllKeys(exposureSet, ['RTCIdentityProvider']);
    });

    it('invalid exposure', () => {
      const specIDLs = {
        first: WebIDL2.parse(
          `[Exposed=SomeWrongScope]
          interface Dummy {
               readonly attribute boolean imadumdum;
             };`
        )
      };
      const {ast} = flattenIDL(specIDLs, customIDLs);
      const interfaces = ast.filter((dfn) => dfn.type === 'interface');
      assert.throws(
        () => {
          getExposureSet(interfaces[0], scopes);
        },
        Error,
        'interface Dummy is exposed on SomeWrongScope but SomeWrongScope is not a valid scope'
      );
    });
  });

  describe('buildIDLTests', () => {
    const scopes = new Set([
      'Window',
      'Worker',
      'SharedWorker',
      'ServiceWorker',
      'AudioWorklet'
    ]);

    it('interface with attribute', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Attr {
             attribute any name;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.Attr': {
          code: '"Attr" in self',
          exposure: ['Window']
        },
        'api.Attr.name': {
          code: '"Attr" in self && "name" in Attr.prototype',
          exposure: ['Window']
        }
      });
    });

    it('interface with method', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Node {
             boolean contains(Node? other);
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.Node': {
          code: '"Node" in self',
          exposure: ['Window']
        },
        'api.Node.contains': {
          code: '"Node" in self && "contains" in Node.prototype',
          exposure: ['Window']
        }
      });
    });

    it('interface with static method', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface MediaSource {
             static boolean isTypeSupported(DOMString type);
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.MediaSource': {
          code: '"MediaSource" in self',
          exposure: ['Window']
        },
        'api.MediaSource.isTypeSupported': {
          code: '"MediaSource" in self && "isTypeSupported" in MediaSource',
          exposure: ['Window']
        }
      });
    });

    it('interface with const', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Window {
             const boolean isWindow = true;
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.Window': {
          code: '"Window" in self',
          exposure: ['Window']
        }
      });
    });

    it('interface with event handler', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Foo {
             attribute EventHandler onadd;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.Foo': {
          code: '"Foo" in self',
          exposure: ['Window']
        }
      });
    });

    it('interface with custom test', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface ANGLE_instanced_arrays {
            undefined drawArraysInstancedANGLE(
              GLenum mode,
              GLint first,
              GLsizei count,
              GLsizei primcount);

            undefined drawElementsInstancedANGLE(
              GLenum mode,
              GLsizei count,
              GLenum type,
              GLintptr offset,
              GLsizei primcount);
          };

          [Exposed=Window]
          interface Document {
            readonly attribute boolean loaded;
            readonly attribute DOMString? characterSet;
          };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.ANGLE_instanced_arrays': {
          code: `(function () {
  var canvas = document.createElement("canvas");
  var gl = canvas.getContext("webgl");
  var instance = gl.getExtension("ANGLE_instanced_arrays");
  return !!instance;
})();
`,
          exposure: ['Window']
        },
        'api.ANGLE_instanced_arrays.drawArraysInstancedANGLE': {
          code: `(function () {
  var canvas = document.createElement("canvas");
  var gl = canvas.getContext("webgl");
  var instance = gl.getExtension("ANGLE_instanced_arrays");
  return true && instance && "drawArraysInstancedANGLE" in instance;
})();
`,
          exposure: ['Window']
        },
        'api.ANGLE_instanced_arrays.drawElementsInstancedANGLE': {
          code: `(function () {
  var canvas = document.createElement("canvas");
  var gl = canvas.getContext("webgl");
  var instance = gl.getExtension("ANGLE_instanced_arrays");
  return !!instance && "drawElementsInstancedANGLE" in instance;
})();
`,
          exposure: ['Window']
        },
        'api.Document': {
          code: '"Document" in self',
          exposure: ['Window']
        },
        'api.Document.characterSet': {
          code: `(function () {
  return document.characterSet == "UTF-8";
})();
`,
          exposure: ['Window']
        },
        'api.Document.loaded': {
          code: '"Document" in self && "loaded" in Document.prototype',
          exposure: ['Window']
        },
        'api.Document.loaded.loaded_is_boolean': {
          code: `(function () {
  return typeof document.loaded === "boolean";
})();
`,
          exposure: ['Window']
        }
      });
    });

    it('interface with legacy namespace', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window, LegacyNamespace]
           interface Legacy {};`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {});
    });

    it('global interface', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Worker, Global=Worker]
           interface WorkerGlobalScope {
             attribute boolean isLoaded;
             const boolean active = true;
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.WorkerGlobalScope': {
          code: '"WorkerGlobalScope" in self',
          exposure: ['Worker']
        },
        'api.WorkerGlobalScope.isLoaded': {
          code: '"isLoaded" in self',
          exposure: ['Worker']
        }
      });
    });

    it('interface with constructor operation', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Number {
             constructor(optional any value);
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.Number': {
          code: '"Number" in self',
          exposure: ['Window']
        },
        'api.Number.Number': {
          code: 'bcd.testConstructor("Number");',
          exposure: ['Window']
        }
      });
    });

    it('interface with [HTMLConstructor] constructor operation', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface HTMLButtonElement {
             [HTMLConstructor] constructor();
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.HTMLButtonElement': {
          code: '"HTMLButtonElement" in self',
          exposure: ['Window']
        }
        // no constructor test
      });
    });

    it('iterable interface', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface DoubleList {
             iterable<double>;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.DoubleList': {
          code: '"DoubleList" in self',
          exposure: ['Window']
        },
        'api.DoubleList.@@iterator': {
          code: '"Symbol" in self && "iterator" in Symbol && "DoubleList" in self && Symbol.iterator in DoubleList.prototype',
          exposure: ['Window']
        },
        'api.DoubleList.entries': {
          code: '"DoubleList" in self && "entries" in DoubleList.prototype',
          exposure: ['Window']
        },
        'api.DoubleList.forEach': {
          code: '"DoubleList" in self && "forEach" in DoubleList.prototype',
          exposure: ['Window']
        },
        'api.DoubleList.keys': {
          code: '"DoubleList" in self && "keys" in DoubleList.prototype',
          exposure: ['Window']
        },
        'api.DoubleList.values': {
          code: '"DoubleList" in self && "values" in DoubleList.prototype',
          exposure: ['Window']
        }
      });
    });

    it('async iterable interface', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface ReadableStream {
             async iterable<any>;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.ReadableStream': {
          code: '"ReadableStream" in self',
          exposure: ['Window']
        },
        'api.ReadableStream.@@asyncIterator': {
          code: '"Symbol" in self && "asyncIterator" in Symbol && "ReadableStream" in self && Symbol.asyncIterator in ReadableStream.prototype',
          exposure: ['Window']
        },
        'api.ReadableStream.values': {
          code: '"ReadableStream" in self && "values" in ReadableStream.prototype',
          exposure: ['Window']
        }
      });
    });

    it('pair async iterable interface', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface AsyncMap {
             async iterable<DOMString, any>;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.AsyncMap': {
          code: '"AsyncMap" in self',
          exposure: ['Window']
        },
        'api.AsyncMap.@@asyncIterator': {
          code: '"Symbol" in self && "asyncIterator" in Symbol && "AsyncMap" in self && Symbol.asyncIterator in AsyncMap.prototype',
          exposure: ['Window']
        },
        'api.AsyncMap.values': {
          code: '"AsyncMap" in self && "values" in AsyncMap.prototype',
          exposure: ['Window']
        },
        'api.AsyncMap.entries': {
          code: '"AsyncMap" in self && "entries" in AsyncMap.prototype',
          exposure: ['Window']
        },
        'api.AsyncMap.keys': {
          code: '"AsyncMap" in self && "keys" in AsyncMap.prototype',
          exposure: ['Window']
        }
      });
    });

    it('maplike interface', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface DoubleMap {
             maplike<DOMString, double>;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.DoubleMap': {
          code: '"DoubleMap" in self',
          exposure: ['Window']
        },
        'api.DoubleMap.@@iterator': {
          code: '"Symbol" in self && "iterator" in Symbol && "DoubleMap" in self && Symbol.iterator in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.clear': {
          code: '"DoubleMap" in self && "clear" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.delete': {
          code: '"DoubleMap" in self && "delete" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.entries': {
          code: '"DoubleMap" in self && "entries" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.forEach': {
          code: '"DoubleMap" in self && "forEach" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.get': {
          code: '"DoubleMap" in self && "get" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.has': {
          code: '"DoubleMap" in self && "has" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.keys': {
          code: '"DoubleMap" in self && "keys" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.set': {
          code: '"DoubleMap" in self && "set" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.size': {
          code: '"DoubleMap" in self && "size" in DoubleMap.prototype',
          exposure: ['Window']
        },
        'api.DoubleMap.values': {
          code: '"DoubleMap" in self && "values" in DoubleMap.prototype',
          exposure: ['Window']
        }
      });
    });

    it('setlike interface', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface DoubleSet {
             setlike<double>;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.DoubleSet': {
          code: '"DoubleSet" in self',
          exposure: ['Window']
        },
        'api.DoubleSet.@@iterator': {
          code: '"Symbol" in self && "iterator" in Symbol && "DoubleSet" in self && Symbol.iterator in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.add': {
          code: '"DoubleSet" in self && "add" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.clear': {
          code: '"DoubleSet" in self && "clear" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.delete': {
          code: '"DoubleSet" in self && "delete" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.entries': {
          code: '"DoubleSet" in self && "entries" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.forEach': {
          code: '"DoubleSet" in self && "forEach" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.has': {
          code: '"DoubleSet" in self && "has" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.keys': {
          code: '"DoubleSet" in self && "keys" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.size': {
          code: '"DoubleSet" in self && "size" in DoubleSet.prototype',
          exposure: ['Window']
        },
        'api.DoubleSet.values': {
          code: '"DoubleSet" in self && "values" in DoubleSet.prototype',
          exposure: ['Window']
        }
      });
    });

    it('interface with getter/setter', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface GetMe {
             getter GetMe (unsigned long index);
             setter undefined (GetMe data, optional unsigned long index);
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.GetMe': {
          code: '"GetMe" in self',
          exposure: ['Window']
        }
      });
    });

    it('varied exposure', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window] interface Worker {};
           [Exposed=Worker] interface WorkerSync {};
           [Exposed=(Window,Worker)] interface MessageChannel {};
           [Exposed=Window] namespace console {};`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.console': {
          code: '"console" in self',
          exposure: ['Window']
        },
        'api.MessageChannel': {
          code: '"MessageChannel" in self',
          exposure: ['Window', 'Worker']
        },
        'api.Worker': {
          code: '"Worker" in self',
          exposure: ['Window']
        },
        'api.WorkerSync': {
          code: '"WorkerSync" in self',
          exposure: ['Worker']
        }
      });
    });

    it('interface with stringifier', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Number {
             stringifier DOMString();
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.Number': {
          code: '"Number" in self',
          exposure: ['Window']
        },
        'api.Number.toString': {
          code: '"Number" in self && "toString" in Number.prototype',
          exposure: ['Window']
        }
      });
    });

    it('interface with named stringifier', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface HTMLAreaElement {
             stringifier readonly attribute USVString href;
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.HTMLAreaElement': {
          code: '"HTMLAreaElement" in self',
          exposure: ['Window']
        },
        'api.HTMLAreaElement.href': {
          code: '"HTMLAreaElement" in self && "href" in HTMLAreaElement.prototype',
          exposure: ['Window']
        },
        'api.HTMLAreaElement.toString': {
          code: '"HTMLAreaElement" in self && "toString" in HTMLAreaElement.prototype',
          exposure: ['Window']
        }
      });
    });

    it('operator variations', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface AudioNode : EventTarget {
             undefined disconnect ();
             undefined disconnect (unsigned long output);
             undefined disconnect (AudioNode destinationNode);
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.AudioNode': {
          code: '"AudioNode" in self',
          exposure: ['Window']
        },
        'api.AudioNode.disconnect': {
          code: '"AudioNode" in self && "disconnect" in AudioNode.prototype',
          exposure: ['Window']
        }
      });
    });

    it('namespace with attribute', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           namespace CSS {
             readonly attribute any paintWorklet;
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.CSS': {
          code: '"CSS" in self',
          exposure: ['Window']
        },
        'api.CSS.paintWorklet': {
          code: '"CSS" in self && "paintWorklet" in CSS',
          exposure: ['Window']
        }
      });
    });

    it('namespace with method', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           namespace CSS {
             boolean supports(CSSOMString property, CSSOMString value);
           };`
      );
      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.CSS': {
          code: '"CSS" in self',
          exposure: ['Window']
        },
        'api.CSS.supports': {
          code: '"CSS" in self && "supports" in CSS',
          exposure: ['Window']
        }
      });
    });

    it('namespace with custom test', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           namespace Scope {
             readonly attribute any specialWorklet;
           };`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.Scope': {
          code: `(function () {
  var scope = Scope;
  return !!scope;
})();
`,
          exposure: ['Window']
        },
        'api.Scope.specialWorklet': {
          code: `(function () {
  var scope = Scope;
  return scope && "specialWorklet" in scope;
})();
`,
          exposure: ['Window']
        }
      });
    });

    it('interface with legacy factory function', () => {
      const ast = WebIDL2.parse(
        `[
             Exposed=Window,
             LegacyFactoryFunction=Image(DOMString src)
           ]
           interface HTMLImageElement {};`
      );

      assert.deepEqual(buildIDLTests(ast, [], scopes), {
        'api.HTMLImageElement': {
          code: '"HTMLImageElement" in self',
          exposure: ['Window']
        },
        'api.HTMLImageElement.Image': {
          code: 'bcd.testConstructor("Image");',
          exposure: ['Window']
        }
      });
    });

    it('Globals', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Dummy {
             readonly attribute boolean imadumdum;
           };`
      );
      const globals = WebIDL2.parse(
        `[Exposed=Window]
           interface mixin WindowOrWorkerGlobalScope {
             undefined atob();
           };`
      );

      assert.deepEqual(buildIDLTests(ast, globals, scopes), {
        'api.Dummy': {
          code: '"Dummy" in self',
          exposure: ['Window']
        },
        'api.Dummy.imadumdum': {
          code: '"Dummy" in self && "imadumdum" in Dummy.prototype',
          exposure: ['Window']
        },
        'api.atob': {
          code: '"atob" in self',
          exposure: ['Window', 'Worker']
        }
      });
    });
  });

  describe('validateIDL', () => {
    it('valid idl', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Node {
             boolean contains(Node otherNode);
           };`
      );
      assert.doesNotThrow(() => {
        validateIDL(ast);
      });
    });

    it('invalid idl', () => {
      const ast = WebIDL2.parse(`interface Invalid {};`);
      assert.throws(
        () => {
          validateIDL(ast);
        },
        `Web IDL validation failed:
Validation error at line 1, inside \`interface Invalid\`:
interface Invalid {};
          ^ Interfaces must have \`[Exposed]\` extended attribute. To fix, add, for example, \`[Exposed=Window]\`. Please also consider carefully if your interface should also be exposed in a Worker scope. Refer to the [WebIDL spec section on Exposed](https://heycam.github.io/webidl/#Exposed) for more information. [require-exposed]`
      );
    });

    it('unknown types', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Dummy {
             attribute Dumdum imadumdum;
           };`
      );
      assert.throws(() => {
        validateIDL(ast);
      }, 'Unknown type Dumdum');
    });

    it('ignored unknown types', () => {
      const ast = WebIDL2.parse(
        `[Exposed=Window]
           interface Dummy {
             attribute CSSOMString style;
           };`
      );
      assert.doesNotThrow(() => {
        validateIDL(ast);
      });
    });

    it('allow LegacyNoInterfaceObject', () => {
      const ast = WebIDL2.parse(
        `[Exposed=(Window,Worker), LegacyNoInterfaceObject]
           interface ANGLE_instanced_arrays {};`
      );
      assert.doesNotThrow(() => {
        validateIDL(ast);
      });
    });
  });

  describe('buildCSS', () => {
    it('valid input', () => {
      const webrefCSS = {
        'css-fonts': {
          properties: [{name: 'font-family'}, {name: 'font-weight'}]
        },
        'css-grid': {
          properties: [{name: 'grid'}]
        }
      };

      const customCSS = {
        properties: {
          'font-family': {
            __values: ['emoji', 'system-ui'],
            __additional_values: {
              historic: ['sans-serif', 'serif']
            }
          },
          zoom: {}
        }
      };

      assert.deepEqual(buildCSS(webrefCSS, customCSS), {
        'css.properties.font-family': {
          code: 'bcd.testCSSProperty("font-family")',
          exposure: ['Window']
        },
        'css.properties.font-family.emoji': {
          code: 'bcd.testCSSProperty("font-family", "emoji")',
          exposure: ['Window']
        },
        'css.properties.font-family.historic': {
          code: 'bcd.testCSSProperty("font-family", "sans-serif") || bcd.testCSSProperty("font-family", "serif")',
          exposure: ['Window']
        },
        'css.properties.font-family.system-ui': {
          code: 'bcd.testCSSProperty("font-family", "system-ui")',
          exposure: ['Window']
        },
        'css.properties.font-weight': {
          code: 'bcd.testCSSProperty("font-weight")',
          exposure: ['Window']
        },
        'css.properties.grid': {
          code: 'bcd.testCSSProperty("grid")',
          exposure: ['Window']
        },
        'css.properties.zoom': {
          code: 'bcd.testCSSProperty("zoom")',
          exposure: ['Window']
        }
      });
    });

    it('with custom test', () => {
      const css = {
        'css-dummy': {
          properties: [{name: 'foo'}]
        }
      };

      assert.deepEqual(buildCSS(css, {properties: {}}), {
        'css.properties.foo': {
          code: `(function () {
  return 1;
})();
`,
          exposure: ['Window']
        }
      });
    });

    it('double-defined property', () => {
      const css = {
        'css-dummy': {
          properties: [{name: 'foo'}]
        }
      };

      assert.throws(() => {
        buildCSS(css, {properties: {foo: {}}});
      }, 'Custom CSS property already known: foo');
    });

    it('invalid import', () => {
      const css = {
        'css-dummy': {
          properties: [{name: 'bar'}]
        }
      };

      assert.deepEqual(buildCSS(css, {properties: {}}), {
        'css.properties.bar': {
          code: `(function () {
  throw "Test is malformed: <%css.properties.foo:a%> is an invalid import reference";
})();
`,
          exposure: ['Window']
        }
      });
    });
  });

  it('buildJS', () => {
    const customJS = {
      builtins: {
        AggregateError: {
          ctor_args: "[new Error('message')]"
        },
        Array: {
          ctor_args: '2'
        },
        'Array.prototype.at': {},
        'Array.prototype.@@iterator': {},
        'Array.@@species': {},
        Atomics: {},
        'Atomics.add': {},
        BigInt: {
          ctor_args: '1',
          ctor_new: false
        }
      }
    };
    assert.deepEqual(buildJS(customJS), {
      'javascript.builtins.AggregateError': {
        code: 'self.hasOwnProperty("AggregateError")',
        exposure: ['Window']
      },
      'javascript.builtins.AggregateError.AggregateError': {
        code: `(function () {
  if (!("AggregateError" in self)) {
    return { result: false, message: "AggregateError is not defined" };
  }
  var instance = new AggregateError([new Error("message")]);
  return !!instance;
})();
`,
        exposure: ['Window']
      },
      'javascript.builtins.Array': {
        code: 'self.hasOwnProperty("Array")',
        exposure: ['Window']
      },
      'javascript.builtins.Array.@@iterator': {
        code: '"Symbol" in self && "iterator" in Symbol && "Array" in self && Symbol.iterator in Array.prototype',
        exposure: ['Window']
      },
      'javascript.builtins.Array.@@species': {
        code: '"Symbol" in self && "species" in Symbol && "Array" in self && Symbol.species in Array.prototype',
        exposure: ['Window']
      },
      'javascript.builtins.Array.Array': {
        code: `(function () {
  if (!("Array" in self)) {
    return { result: false, message: "Array is not defined" };
  }
  var instance = new Array(2);
  return !!instance;
})();
`,
        exposure: ['Window']
      },
      'javascript.builtins.Array.at': {
        code: '"Array" in self && Object.prototype.hasOwnProperty.call(Array.prototype, "at")',
        exposure: ['Window']
      },
      'javascript.builtins.Atomics': {
        code: 'self.hasOwnProperty("Atomics")',
        exposure: ['Window']
      },
      'javascript.builtins.Atomics.add': {
        code: '"Atomics" in self && Object.prototype.hasOwnProperty.call(Atomics, "add")',
        exposure: ['Window']
      },
      'javascript.builtins.BigInt': {
        code: 'self.hasOwnProperty("BigInt")',
        exposure: ['Window']
      },
      'javascript.builtins.BigInt.BigInt': {
        code: `(function () {
  if (!("BigInt" in self)) {
    return { result: false, message: "BigInt is not defined" };
  }
  var instance = BigInt(1);
  return !!instance;
})();
`,
        exposure: ['Window']
      }
    });
  });
});
