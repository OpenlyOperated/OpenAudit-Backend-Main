// Chai + Server (Server must be loaded before other utilities)
const chai = require("chai");
chai.use(require("chai-http"));
const server = require("../app");
const should = chai.should();

describe("Basic", () => {

  describe("Health Check", () => {
    it("should respond 200 and JSON OK", (done) => {
      chai.request(server)
        .get("/health")
        .end((error, response) => {
          response.should.have.status(200);
          response.body.message.should.contain("OK");
          done();
        });
    });
  });
  
  describe("Home 'Hello Openly Operated World'", () => {
    it("should respond 200 and show Hello Openly Operated World", (done) => {
      chai.request(server)
        .get("/")
        .end((error, response) => {
          response.should.have.status(200);
          response.text.should.contain("Hello");
          done();
        });
    });
  });

  describe("404 Not Found", () => {
    it("should respond 404", (done) => {
      chai.request(server)
        .get("/invalid-url")
        .end((error, response) => {
          response.should.have.status(404);
          response.body.message.should.contain("Not Found");
          done();
        });
    });
  });

  describe("Force a 500 Error", () => {
    it("should not expose error details to client", (done) => {
      chai.request(server)
        .get("/error-test")
        .end((error, response) => {
          response.should.have.status(500);
          response.body.code.should.equal(-1);
          done();
        });
    });
  });

});