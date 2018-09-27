var serializer = {

	serialize : function(msg) {
		return JSON.stringify(msg, null, 2);
	},

	deserialize : function(data) {
		return JSON.parse(data);
	}
}

module.exports = serializer;
