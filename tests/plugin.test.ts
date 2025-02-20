import {EventEmitter} from "node:events";
import addCypressLoadBalancerPlugin from "../src/plugin";
import {getFixture} from "./support/utils";
import sinon from "sinon";


describe('addCypressLoadBalancerPlugin', function () {
    beforeEach(function () {
        //sinon.stub(initializeLoadBalancingFiles)
        const results = getFixture('results.json', {parseJSON: true})
        this.eventEmitter = new EventEmitter()

        this.eventEmitter.on('after:run', fn)

        //const spy = sinon.spy(EventEmitter, 'on')
        //addCypressLoadBalancerPlugin(this.eventEmitter.on)
    })

    it('is added as an "after:run event', function () {
        this.eventEmitter.emit('after:run')
    })
})
