/*
	Curve-Envelope Converter

	A Toon Boom Harmony shelf script that converts selected curve modules' type from curve to envelope and vice versa.
	You can also select a group that contains multiple curve modules for the conversion.
	The script will convert the resting parameter then copy the values over all deformation parameter's keyframes.
	
	Note: The current version does not work properly if a parent curve's handle1 length is 0, or its approximation.

	
	Installation:
	
	1) Download and Unarchive the zip file.
	2) Locate to your user scripts folder (a hidden folder):
	   https://docs.toonboom.com/help/harmony-17/premium/scripting/import-script.html	
	   
	3) Add all unzipped files (*.js, *.ui, and script-icons folder) directly to the folder above.	
	4) Add DEF_Curve_Envelope_Converter to any toolbar.
	
	
	Direction:
	
	Select curve module(s) or group(s), then run DEF_Curve_Envelope_Converter.


	Author:

		Yu Ueda (raindropmoment.com)
		
*/	


var scriptVar = "1.00";


function DEF_Curve_Envelope_Converter()
{	
	var privateFunctions = new private_functions;
	var sNodeList = selection.selectedNodes();
	var curveNodeList = privateFunctions.getCurveList(sNodeList);		
	
	if (curveNodeList.length <= 0)
	{
		MessageBox.information("Please select one or more curve modules.");
		return;
	}

	scene.beginUndoRedoAccum("Curve-Envelope Deformation Converter");		

	for (var i = 0; i < curveNodeList.length; i++)
	{
		var curveType = privateFunctions.getCurveType(curveNodeList[i]);	
		
		if (curveType == "curve")
		{
			privateFunctions.convertCurveType(curveNodeList[i], true /*bool "to envelope" mode*/);			
		}
		else if (curveType == "envelope")
		{
			privateFunctions.convertCurveType(curveNodeList[i], false);			
		}
		else
		{
			MessageLog.trace("An error occured. Failed to identify the selected curve node type.");
		}
	}
		
	scene.endUndoRedoAccum();
}




function private_functions()
{
	this.getCurveList = function(nodeList)
	{
		var curveList = [];
		
		for (var i = 0; i < nodeList.length; i++)
		{
			var sNode = nodeList[i];
			
			if (node.type(sNode) == "CurveModule")
			{
				curveList.push(sNode);
			}
			else if (node.type(sNode) == "GROUP")
			{
				var subNodeList = node.subNodes(sNode);
				var subCurveList = this.getCurveList(subNodeList);
				curveList.push.apply(curveList, subCurveList);
			}
		}
	return(curveList);
	}
	
	
	this.getCurveType = function(argNode)
	{
		var applyParentModifier = node.getTextAttr(argNode, 1, "localReferential");	
		
		switch (applyParentModifier)
		{
			case "Y": return "curve"; break;
			case "N": return "envelope"; break;
			default: return "undefined"; break;
		}
	}

	
	this.getOffsetNode = function(argNode)
	{
		var subNodes = node.subNodes(node.parentNode(argNode));	
		var currentSrc = node.srcNode(argNode, 0);
		
		for (var i=0; i<subNodes.length; i++)
		{
			if (node.type(currentSrc) == "OffsetModule"){return currentSrc;}
			else {currentSrc = node.srcNode(currentSrc, 0);}
		}
	}
	
		
	this.convertCurveType = function(argNode, toEnvelope)
	{
		var offsetNode = this.getOffsetNode(argNode);
		
		if (!offsetNode)
		{
			MessageLog.trace("Failed to locate the leading offset node for the chain.");	
			return;
		}

		var parOrient = this.getCumulativeOrient(offsetNode, argNode);
		var keyframeList = this.getKeyframes(argNode);		
	
						
		// Offset module:
		var parNode = node.srcNode(argNode, 0);
		if (node.type(parNode) == "OffsetModule")
		{
			var p0X_f = node.getAttr(parNode, 1, "restingoffset.x").doubleValue();
			var p0Y_f = node.getAttr(parNode, 1, "restingoffset.y").doubleValue();
			var p0orient_f = node.getAttr(parNode, 1, "restingorientation").doubleValue();			
			
			node.setTextAttr(parNode, "localReferential", 1, toEnvelope? "N": "Y");

			for (var i in keyframeList) 
			{
				node.setTextAttr(parNode, "offset.x", keyframeList[i],  p0X_f);
				node.setTextAttr(parNode, "offset.y", keyframeList[i], p0Y_f);
				node.setTextAttr(parNode, "orientation", keyframeList[i], p0orient_f);
			}
		}

		
		// Curve resting attrs:		
		var newValues;
		
		if (toEnvelope) {newValues = this.convertToEnvelopeValues(argNode, parOrient);}
		else             {newValues = this.convertToCurveValues(argNode, parOrient);}					

		if (!toEnvelope) {node.setTextAttr(argNode, "closePath", 1, "N");}
		node.setTextAttr(argNode, "localReferential", 1, toEnvelope? "N": "Y");	
		node.setTextAttr(argNode, "restingoffset.x", 1, newValues.x);
		node.setTextAttr(argNode, "restingoffset.y", 1, newValues.y);
		node.setTextAttr(argNode, "restlength0", 1, newValues.length0);
		node.setTextAttr(argNode, "restingorientation0", 1, newValues.orient0);
		node.setTextAttr(argNode, "restlength1", 1, newValues.length1);
		node.setTextAttr(argNode, "restingorientation1", 1, newValues.orient1);

		
		// Curve deform attrs:		
		for (var i in keyframeList) 
		{
			node.setTextAttr(argNode, "offset.x", keyframeList[i], newValues.x);
			node.setTextAttr(argNode, "offset.y", keyframeList[i], newValues.y);
			node.setTextAttr(argNode, "length0", keyframeList[i], newValues.length0);
			node.setTextAttr(argNode, "orientation0", keyframeList[i], newValues.orient0);
			node.setTextAttr(argNode, "length1", keyframeList[i], newValues.length1);
			node.setTextAttr(argNode, "orientation1", keyframeList[i], newValues.orient1);
		}	
	}
	
	
	this.getKeyframes = function(argNode)
	{
		// Parse through the selected peg to create a list of frame that has least one keyframe:
		var attrList = ["offset.x", "offset.y", "length0", "orientation0", "length1", "orientation1"];
		var cols = this.getColumnList(argNode, attrList);
		var keysList = [];
			
		for (var i = 0; i < cols.length; i++)
		{
			var numKeys = func.numberOfPoints(cols[i]);
			var colKeysList = [];
			
			for (var ii = 0; ii < numKeys; ii++)
			{
				colKeysList.push(func.pointX(cols[i], ii));
			}	
			keysList.push.apply(keysList, colKeysList);
		}
		
		// If selected curve has no keyframe, add frame 1:
		if (keysList.length <= 0)
		{
			keysList.push(1);
		}
		else
		{
			// Remove duplicate items from the list and then sort it in numeric order:
			keysList = this.optimizeList(keysList);
		}
		
		return keysList;
	}
	

	this.getColumnList = function(argNode, attrList)
	{
		var colList = [];
		
		for (var i in attrList)
		{colList.push(node.linkedColumn(argNode, attrList[i]));}
		
		return colList;
	}
	
	
	this.optimizeList = function(array)
	{
		array = array.filter(function(elem, index, self)
		{
			return index == self.indexOf(elem);
		});
			
		array.sort(function(elem1, elem2)
		{
			return elem1 - elem2;
		});
		
		return array;
	}

	
	this.convertToCurveValues = function(argNode, parOrient)
	{
		// Envelope Offset:
		var p0_f = this.getStartMatrixInField(argNode);
		var p0 = this.toSquare(p0_f);		

		var p3X_f = node.getAttr(argNode, 1, "restingoffset.x").doubleValue();
		var p3Y_f = node.getAttr(argNode, 1, "restingoffset.y").doubleValue();
		var p3 = this.toSquare({x: p3X_f, y: p3Y_f});	

		var length = this.getDistance(p0, p3);		
		var orient = this.getInclination(p0, p3);
		orient -= parOrient;	
		var newP3 = this.getNewPoint(length, orient);	

		
		// Envelope Handle 0:	
		var origin = {x: 0, y: 0};		
		var p1Length_f = node.getAttr(argNode, 1, "restlength0").doubleValue();
		var p1Orient_f = node.getAttr(argNode, 1, "restingorientation0").doubleValue();	
		
		var newP1_f = this.getNewPoint(p1Length_f, p1Orient_f);
		var newP1 = this.toSquare(newP1_f);				
		var newP1Length = this.getDistance(origin, newP1);	
		var newP1Orient = this.getInclination(origin, newP1);
		newP1Orient -= parOrient;

		
		// Envelope Handle 1:
		var p2Length_f = node.getAttr(argNode, 1, "restlength1").doubleValue();
		var p2Orient_f = node.getAttr(argNode, 1, "restingorientation1").doubleValue();	
		
		var newP2_f = this.getNewPoint(p2Length_f, p2Orient_f);
		var newP2 = this.toSquare(newP2_f);				
		var newP2Length = this.getDistance(origin, newP2);	
		var newP2Orient = this.getInclination(origin, newP2);
		newP2Orient -= parOrient;

		
		return {x: newP3.x, y: newP3.y,
				length0: newP1Length, orient0: newP1Orient,
				length1: newP2Length, orient1: newP2Orient}
	}
	
	
	this.convertToEnvelopeValues = function(argNode, parOrient)
	{
		// Curve Offset:
		var p0_f = this.getStartMatrixInField(argNode);
		var p0 = this.toSquare(p0_f);
		
		var p3_f = this.getEndMatrixInField(argNode);
		var p3 = this.toSquare(p3_f);	

	
		// Curve Handle 0:			
		var p1Length = node.getAttr(argNode, 1, "restlength0").doubleValue();
		var p1Orient = node.getAttr(argNode, 1, "restingorientation0").doubleValue();		
		p1Orient += parOrient;
		
		var newP1 = this.getNewPoint(p1Length, p1Orient);
		var newP1Parented = this.addParent(newP1, p0);		
		var newP1_f = this.toField(newP1Parented);			
		var newP1Length_f = this.getDistance(p0_f, newP1_f);	
		var newP1Orient_f = this.getInclination(p0_f, newP1_f);


		// Curve Handle 1:	
		var p2Length = node.getAttr(argNode, 1, "restlength1").doubleValue();
		var p2Orient = node.getAttr(argNode, 1, "restingorientation1").doubleValue();
		p2Orient += parOrient;
		
		var newP2 = this.getNewPoint(p2Length, p2Orient);	
		var newP2Parented = this.addParent(newP2, p3);	
		var newP2_f = this.toField(newP2Parented);
		var newP2Length_f = this.getDistance(p3_f, newP2_f);	
		var newP2Orient_f = this.getInclination(p3_f, newP2_f);

		
		return {x: p3_f.x, y: p3_f.y,
				length0: newP1Length_f, orient0: newP1Orient_f,
				length1: newP2Length_f, orient1: newP2Orient_f}
	}

	
	this.getStartMatrixInField = function(aNode)
	{
		var matrix = deformation.lastRestMatrix(aNode, 1);
		var p3d = matrix.multiply(new Point3d);	
		return scene.fromOGL(p3d);
	}	
	
	
	this.getEndMatrixInField = function(aNode)
	{
		var matrix = deformation.nextRestMatrix(aNode, 1);
		var p3d = matrix.multiply(new Point3d);	
		return scene.fromOGL(p3d);
	}	
	
	
	this.getCumulativeOrient = function(offset, aNode)
	{
		var offsetOrient_f = node.getAttr(offset, 1, "restingorientation").doubleValue();
		var orient = this.toSquareAngle(offsetOrient_f);
		
		var parNode = node.srcNode(aNode, 0);
		var iterate = node.subNodes(node.parentNode(aNode));
		var parCurveList = [];

		for (var i = 0; i < iterate.length; i++)
		{
			if (node.type(parNode) == "OffsetModule" || !node.getName(parNode))
			{  break;  }		
			else if (node.type(parNode) == "CurveModule")
			{
				parCurveList.push(parNode);
				parNode = node.srcNode(parNode, 0);			
			}
			else
			{  parNode = node.srcNode(parNode, 0);}
		}
		
		var reversedList = parCurveList.reverse(); 

		for (var i in reversedList)
		{	
			var currentCurveType = this.getCurveType(reversedList[i]);	
			var handleLength = node.getAttr(reversedList[i], 1, "restlength1").doubleValue();

			var handleOrient = 0;			
		
			if (handleLength <= 0.0001)
			{
				var bez;
	
				if (currentCurveType == "curve")
				{
					bez = this.curveToBezPoints(reversedList[i], orient);
				}
				else if (currentCurveType == "envelope")
				{	
					bez = this.envelopeToBezPoints(reversedList[i], 0);
				}
				
				handleOrient += this.getBezierInclination(bez.p0, bez.p1, bez.p2, bez.p3, 0.99999999 /*time func*/);				
			}
			else
			{
				handleOrient += node.getAttr(reversedList[i], 1, "restingorientation1").doubleValue();						
			}

			if (currentCurveType == "curve")
			{	
				orient += handleOrient;
			}				
			else if (currentCurveType == "envelope")
			{						
				handleOrient = this.toSquareAngle(handleOrient);
				orient = handleOrient;
			}							
		}	
		return orient;
	}
	
	
	this.envelopeToBezPoints = function(argNode, parOrient)
	{
		// Curve Offset:
		var p0_f = this.getStartMatrixInField(argNode);
		var p0 = this.toSquare(p0_f);
		
		var p3_f = this.getEndMatrixInField(argNode);
		var p3 = this.toSquare(p3_f);	

	
		// Curve Handle 0:			
		var p1Length = node.getAttr(argNode, 1, "restlength0").doubleValue();
		var p1Orient = node.getAttr(argNode, 1, "restingorientation0").doubleValue();		
		p1Orient += parOrient;
		
		var newP1 = this.getNewPoint(p1Length, p1Orient);
		newP1 = this.addParent(newP1, p0);		


		// Curve Handle 1:	
		var p2Length = node.getAttr(argNode, 1, "restlength1").doubleValue();
		var p2Orient = node.getAttr(argNode, 1, "restingorientation1").doubleValue();
		p2Orient += parOrient;

		var P2_180 = this.getNewPoint(p2Length, p2Orient + 180);
		P2_180 = this.addParent(P2_180, p3);
		
		return {p0: p0, p1: newP1, p2: P2_180, p3: p3};
	}
	
	
	this.curveToBezPoints = function(argNode, parOrient)
	{
		// Curve Offset:
		var p0_f = this.getStartMatrixInField(argNode);
		var p0 = this.toSquare(p0_f);
		
		var p3_f = this.getEndMatrixInField(argNode);
		var p3 = this.toSquare(p3_f);	

	
		// Curve Handle 0:			
		var p1Length_f = node.getAttr(argNode, 1, "restlength0").doubleValue();
		var p1Orient_f = node.getAttr(argNode, 1, "restingorientation0").doubleValue();		
		var parOrient_f = this.toFieldAngle(parOrient);
		p1Orient_f += parOrient_f;
		
		var p1_f = this.getNewPoint(p1Length_f, p1Orient_f);
		p1 = this.toSquare(p1_f);
		p1 = this.addParent(p1, p0);


		// Curve Handle 1:	
		var p2Length_f = node.getAttr(argNode, 1, "restlength1").doubleValue();
		var p2Orient_f = node.getAttr(argNode, 1, "restingorientation1").doubleValue();
		p2Orient_f += parOrient_f;
		
		var p2_f = this.getNewPoint(p2Length_f, p2Orient_f + 180);
		p2 = this.toSquare(p2_f);
		p2 = this.addParent(p2, p3);
		
		return {p0: p0, p1: p1, p2: p2, p3: p3};
	}
	
	
	this.toField = function(point)
	{
		var aspect = scene.unitsAspectRatioX() /scene.unitsAspectRatioY();		
		return {x: point.x, y: point.y *aspect};
	}

	
	this.toSquare = function(point)	
	{
		var aspect = scene.unitsAspectRatioY() /scene.unitsAspectRatioX();			
		return {x: point.x, y: point.y *aspect};
	}

	
	this.toSquareAngle = function(orient)
	{
		var aspect = {x: 1, y: scene.unitsAspectRatioY() /scene.unitsAspectRatioX()};		
		var opposite = aspect.x *Math.tan(orient%180 *(Math.PI/180));
		var newAngle = Math.atan2(opposite *aspect.y, aspect.x) *(180/Math.PI);
		
		if      (orient%360 > 90 && orient%360 < 270)   {newAngle += 180;}
		else if (orient%360 < -90 && orient%360 > -270) {newAngle -= 180;}		

		var adjustment = this.removeDecimals(orient /360) *360;
		return newAngle += adjustment;
	}
	
	
	this.toFieldAngle = function(orient)
	{
		var aspect = {x: 1, y: scene.unitsAspectRatioX() /scene.unitsAspectRatioY()};		
		var opposite = aspect.x *Math.tan(orient%180 *(Math.PI/180));
		var newAngle = Math.atan2(opposite *aspect.y, aspect.x) *(180/Math.PI);
		
		if      (orient%360 > 90 && orient%360 < 270)   {newAngle += 180;}
		else if (orient%360 < -90 && orient%360 > -270) {newAngle -= 180;}		

		var adjustment = this.removeDecimals(orient /360) *360;
		return newAngle += adjustment;
	}
	
	
	this.removeDecimals = function(argVal)
	{
		if (argVal >= 0) {return Math.floor(argVal);}
		else              {return Math.floor(argVal)+1;}
	}	

	
	this.getDistance = function(point1, point2) 
	{
		return Math.sqrt((point2.x - point1.x) * (point2.x - point1.x) + (point2.y - point1.y) * (point2.y - point1.y));
	}

	
	this.getInclination = function(point1, point2)
	{
		return Math.atan2(point2.y - point1.y, point2.x - point1.x) *(180 / Math.PI);
	}

	
	this.getNewPoint = function(distance, inclination)
	{
		var newX = distance *Math.cos(inclination *(Math.PI/180));
		var newY = distance *Math.sin(inclination *(Math.PI/180));	
		
		return {x: newX, y: newY};
	}

	
	this.addParent = function(child, parent)
	{
		return {x: child.x + parent.x, y: child.y + parent.y};
	}
	
	
	this.getBezierInclination = function(p0, p1, p2, p3, t)
	{
		var tangentVertexP6x = [p0.x, p1.x, p2.x];
		var p6x = this.bezierFomula(2, tangentVertexP6x, t);

		var tangentVertexP6y = [p0.y, p1.y, p2.y];
		var p6y = this.bezierFomula(2, tangentVertexP6y, t);

		var tangentVertexP7x = [p1.x, p2.x, p3.x];
		var p7x = this.bezierFomula(2, tangentVertexP7x, t);

		var tangentVertexP7y = [p1.y, p2.y, p3.y];
		var p7y = this.bezierFomula(2, tangentVertexP7y, t);

		var p6 = {x: p6x, y: p6y};	
		var p7 = {x: p7x, y: p7y};
		
		return this.getInclination(p6, p7);
	}
	
	
	this.factorial = function(f)
	{
		if (f <= 1) {return 1;}
		else         {return f * this.factorial(f -1);}
	}	
	

	this.binomial = function(n, k)
	{
		return this.factorial(n) / (this.factorial(n -k) * this.factorial(k));
	}


	this.bezierFomula = function(bezType, vertex, t)
	{
		var pointOnBezier = 0;
		
		for (var i = 0; i <= bezType; i++)
		{
			var number = this.binomial(bezType, i) *Math.pow((1 -t), bezType -i) *Math.pow(t, i) *vertex[i];
			pointOnBezier += number;
		}
		return pointOnBezier;
	}	
}